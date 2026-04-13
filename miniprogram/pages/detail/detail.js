const { todayYmd } = require("../../utils/date");
const { loadMedications, endMedication } = require("../../utils/medications");
const { callFunction } = require("../../utils/cloud");

function normalizeMed(raw) {
  if (!raw) return null;
  const times = Array.isArray(raw.times) ? raw.times : ["08:00"];
  const timePoints = Array.isArray(raw.timePoints) && raw.timePoints.length
    ? raw.timePoints
    : times.map((t) => ({ time: t, note: "" }));
  return {
    ...raw,
    frequency: Math.max(1, Math.min(10, Number(raw.frequency || 1))),
    intervalDays: Math.max(0, Math.min(30, Number(raw.intervalDays || 0))),
    times,
    timePoints,
    active: raw.active !== false,
  };
}

Page({
  data: {
    id: "",
    med: null,
    shareCode: "",
  },

  onLoad(options) {
    this.setData({ id: options && options.id ? String(options.id) : "" });
  },

  async onShow() {
    const id = this.data.id;
    const meds = loadMedications();
    const local = normalizeMed(meds.find((m) => m.id === id) || null);
    if (local) {
      this.setData({ med: local });
      return;
    }

    // 本地没有则尝试从云端拉取（便于多端同步）
    try {
      const res = await callFunction("plans", { action: "getByClientId", clientId: id });
      if (res && res.ok && res.plan) {
        const cloudMed = normalizeMed({
          id,
          ...res.plan,
        });
        this.setData({ med: cloudMed });
      } else {
        this.setData({ med: null });
      }
    } catch (e) {
      this.setData({ med: null });
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onEdit() {
    const id = String(this.data.id || "");
    if (!id) return;
    wx.navigateTo({ url: `/pages/edit/edit?id=${id}` });
  },

  onCopyShare() {
    const med = this.data.med;
    if (!med) return;

    const payload = {
      v: 1,
      meds: [
        {
          name: med.name,
          frequency: med.frequency,
          times: med.times,
          timePoints: med.timePoints,
          intervalDays: med.intervalDays,
          startDate: med.startDate,
          endDate: med.endDate,
          amount: med.amount,
          unit: med.unit,
        },
      ],
    };

    callFunction("share", { action: "generate", payload, ttlDays: 7 })
      .then((res) => {
        if (!res || !res.ok) throw new Error("share failed");
        this.setData({ shareCode: res.code || "" });
        wx.setClipboardData({
          data: res.path || "",
          success: () => wx.showToast({ title: "分享链接已复制", icon: "success" }),
        });
      })
      .catch(() => {
        wx.showToast({ title: "生成分享链接失败", icon: "none" });
      });
  },

  onShareAppMessage() {
    const shareCode = String(this.data.shareCode || "");
    if (!shareCode) {
      return {
        title: "用药计划",
        path: "/pages/home/home",
      };
    }
    return {
      title: "用药计划分享",
      path: `/pages/import/import?shareCode=${shareCode}`,
    };
  },

  onEnd() {
    const med = this.data.med;
    if (!med) return;
    wx.showModal({
      title: "确认结束？",
      content: "确定要主动结束该药品的提醒吗？",
      confirmText: "结束",
      confirmColor: "#ef4444",
      success: (res) => {
        if (!res.confirm) return;
        endMedication(med.id, todayYmd());
        // 标记为已结束（云端保留，7天后由定时器清理）
        callFunction("plans", {
          action: "upsert",
          med: {
            clientId: med.id,
            name: med.name,
            frequency: med.frequency,
            times: med.times,
            timePoints: med.timePoints,
            intervalDays: med.intervalDays,
            startDate: med.startDate,
            endDate: todayYmd(),
            endedAt: Date.now(),
            amount: med.amount,
            unit: med.unit,
            active: false,
          },
        }).catch(() => {});
        wx.showToast({ title: "已结束", icon: "success" });
        wx.redirectTo({ url: "/pages/schedule/schedule" });
      },
    });
  },
});
