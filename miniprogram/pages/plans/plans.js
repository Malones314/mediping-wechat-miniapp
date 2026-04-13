const { loadMedications, deleteMedication } = require("../../utils/medications");
const { callFunction } = require("../../utils/cloud");

function normalizePlan(p) {
  const id = String(p.id || p.clientId || p._id || "");
  if (!id) return null;
  const times = Array.isArray(p.times) ? p.times : [];
  const frequency = Math.max(1, Math.min(10, Number(p.frequency || 1)));
  const intervalDays = Math.max(0, Math.min(30, Number(p.intervalDays || 0)));
  return {
    id,
    name: String(p.name || "").trim() || "未命名",
    amount: String(p.amount || "1"),
    unit: String(p.unit || "粒"),
    active: p.active !== false,
    frequency,
    intervalDays,
    times,
    timesText: times.join("、") || "--",
    endDate: String(p.endDate || ""),
    endedAt: Number(p.endedAt || 0),
  };
}

Page({
  data: {
    activePlans: [],
    endedPlans: [],
  },

  onShow() {
    this._refresh();
  },

  async _refresh() {
    // 默认先用本地，云端成功后覆盖
    const local = loadMedications().map(normalizePlan).filter(Boolean);
    this._setSplitPlans(local);

    try {
      const res = await callFunction("plans", { action: "list" });
      if (res && res.ok && Array.isArray(res.plans)) {
        const cloudPlans = res.plans
          .map((p) =>
            normalizePlan({
              id: p.clientId,
              ...p,
            })
          )
          .filter(Boolean);
        this._setSplitPlans(cloudPlans);
      }
    } catch (e) {}
  },

  _setSplitPlans(all) {
    const activePlans = (all || []).filter((p) => p.active);
    const endedPlans = (all || []).filter((p) => !p.active);
    endedPlans.sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
    this.setData({ activePlans, endedPlans });
  },

  onBack() {
    wx.redirectTo({ url: "/pages/home/home" });
  },

  onGoSchedule() {
    wx.navigateTo({ url: "/pages/schedule/schedule" });
  },

  onAdd() {
    wx.navigateTo({ url: "/pages/add/add" });
  },

  onOpenDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/edit/edit?id=${id}` });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    wx.showModal({
      title: "确认删除？",
      content: "删除后将同步删除云端计划，并无法恢复。",
      confirmText: "删除",
      confirmColor: "#ef4444",
      success: (res) => {
        if (!res.confirm) return;

        deleteMedication(id);
        this._refresh();

        callFunction("plans", { action: "deleteByClientId", clientId: id })
          .then(() => wx.showToast({ title: "已删除", icon: "success" }))
          .catch(() => wx.showToast({ title: "云端删除失败", icon: "none" }))
          .finally(() => this._refresh());
      },
    });
  },
});
