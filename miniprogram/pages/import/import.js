const { decodeSharePayload } = require("../../utils/share");
const { addMedication } = require("../../utils/medications");
const { requestMedicationReminderSubscription } = require("../../utils/subscribe");
const { callFunction } = require("../../utils/cloud");

function extractShareCode(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  // 支持直接粘贴页面路径：/pages/import/import?shareCode=xxxx
  const m1 = /shareCode=([0-9a-z]+)/i.exec(raw);
  if (m1 && m1[1]) return m1[1];

  // 支持仅粘贴 code（默认 10 位）
  if (/^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/i.test(raw)) return raw;

  return "";
}

Page({
  data: {
    text: "",
    isImporting: false,
    isSuccess: false,
    shareCode: "",
  },

  onLoad(options) {
    const shareCode = options && options.shareCode ? String(options.shareCode) : "";
    if (shareCode) {
      this.setData({ shareCode });
      this._importFromShareCode(shareCode);
    }
  },

  onTextInput(e) {
    this.setData({ text: e.detail.value });
  },

  async _importFromShareCode(code) {
    if (this.data.isImporting) return;
    this.setData({ isImporting: true, isSuccess: false });

    // 必须引导用户进行订阅消息授权（不强制必须 accept，但必须调用）
    requestMedicationReminderSubscription().then(() => {});

    try {
      const res = await callFunction("share", { action: "parse", code });
      if (!res || !res.ok || !res.payload || !Array.isArray(res.payload.meds)) {
        throw new Error("invalid share payload");
      }

      let ok = 0;
      const upsertMeds = [];
      res.payload.meds.forEach((m) => {
        const local = addMedication({
          name: m.name,
          frequency: m.frequency,
          timePoints: m.timePoints,
          times: m.times,
          intervalDays: m.intervalDays,
          startDate: m.startDate,
          endDate: m.endDate,
          amount: m.amount,
          unit: m.unit,
        });
        if (local) {
          ok += 1;
          upsertMeds.push({
            clientId: local.id,
            name: local.name,
            frequency: local.frequency,
            times: local.times,
            timePoints: local.timePoints,
            intervalDays: local.intervalDays,
            startDate: local.startDate,
            endDate: local.endDate,
            amount: local.amount,
            unit: local.unit,
            active: local.active,
          });
        }
      });

      if (!ok) throw new Error("no valid meds");
      await callFunction("plans", { action: "batchUpsert", meds: upsertMeds });

      this.setData({ isImporting: false, isSuccess: true });
      wx.showToast({ title: "导入成功", icon: "success" });
      setTimeout(() => wx.redirectTo({ url: "/pages/schedule/schedule" }), 800);
    } catch (e) {
      this.setData({ isImporting: false });
      wx.showToast({ title: "链接无效或已过期", icon: "none" });
    }
  },

  onImport() {
    if (this.data.isImporting) return;
    const raw = String(this.data.text || "").trim();
    if (!raw) {
      wx.showToast({ title: "请粘贴分享码", icon: "none" });
      return;
    }

    // 若粘贴的是“分享链接/路径/短 code”，走云函数解析
    const code = extractShareCode(raw);
    if (code) {
      this._importFromShareCode(code);
      return;
    }

    this.setData({ isImporting: true, isSuccess: false });

    // 必须引导用户进行订阅消息授权（不强制必须 accept，但必须调用）
    requestMedicationReminderSubscription().then(() => {});

    setTimeout(() => {
      try {
        const payload = decodeSharePayload(raw);
        if (!payload || payload.v !== 1 || !Array.isArray(payload.meds)) {
          throw new Error("invalid payload");
        }

        let ok = 0;
        const upsertMeds = [];
        payload.meds.forEach((m) => {
          const res = addMedication({
            name: m.name,
            frequency: m.frequency,
            timePoints: m.timePoints,
            times: m.times,
            intervalDays: m.intervalDays,
            startDate: m.startDate,
            endDate: m.endDate,
            amount: m.amount,
            unit: m.unit,
          });
          if (res) {
            ok += 1;
            upsertMeds.push({
              clientId: res.id,
              name: res.name,
              frequency: res.frequency,
              times: res.times,
              timePoints: res.timePoints,
              intervalDays: res.intervalDays,
              startDate: res.startDate,
              endDate: res.endDate,
              amount: res.amount,
              unit: res.unit,
              active: res.active,
            });
          }
        });

        if (ok === 0) throw new Error("no valid medications");

        callFunction("plans", { action: "batchUpsert", meds: upsertMeds }).catch(() => {});

        this.setData({ isImporting: false, isSuccess: true });
        wx.showToast({ title: "导入成功", icon: "success" });
        setTimeout(() => wx.redirectTo({ url: "/pages/schedule/schedule" }), 800);
      } catch (e) {
        this.setData({ isImporting: false });
        wx.showToast({ title: "分享码无效（请粘贴分享链接或 MEDPLAN 分享码）", icon: "none" });
      }
    }, 600);
  },
});
