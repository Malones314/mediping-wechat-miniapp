const { todayYmd } = require("../../utils/date");
const { addMedication } = require("../../utils/medications");
const { requestMedicationReminderSubscription } = require("../../utils/subscribe");
const { callFunction } = require("../../utils/cloud");

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

Page({
  data: {
    name: "",
    amount: "1",
    units: ["粒", "片", "mg", "ml", "袋", "支"],
    unitIndex: 0,
    frequency: 1,
    timePoints: [{ time: "08:00", note: "" }],
    intervalDays: 0,
    startDate: todayYmd(),
    endDate: "",
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
  },

  onUnitChange(e) {
    this.setData({ unitIndex: Number(e.detail.value || 0) });
  },

  _syncTimesWithFrequency(nextFreq) {
    const timePoints = (this.data.timePoints || []).slice(0);
    if (nextFreq > timePoints.length) {
      for (let i = timePoints.length; i < nextFreq; i++) timePoints.push({ time: "08:00", note: "" });
    } else if (nextFreq < timePoints.length) {
      timePoints.length = nextFreq;
    }
    this.setData({ frequency: nextFreq, timePoints });
  },

  onFreqMinus() {
    const next = clamp(Number(this.data.frequency || 1) - 1, 1, 10);
    this._syncTimesWithFrequency(next);
  },

  onFreqPlus() {
    const next = clamp(Number(this.data.frequency || 1) + 1, 1, 10);
    this._syncTimesWithFrequency(next);
  },

  onFreqInput(e) {
    const val = parseInt(e.detail.value, 10);
    const next = clamp(Number.isFinite(val) ? val : 1, 1, 10);
    this._syncTimesWithFrequency(next);
  },

  onIntervalMinus() {
    const next = clamp(Number(this.data.intervalDays || 0) - 1, 0, 30);
    this.setData({ intervalDays: next });
  },

  onIntervalPlus() {
    const next = clamp(Number(this.data.intervalDays || 0) + 1, 0, 30);
    this.setData({ intervalDays: next });
  },

  onIntervalInput(e) {
    const val = parseInt(e.detail.value, 10);
    const next = clamp(Number.isFinite(val) ? val : 0, 0, 30);
    this.setData({ intervalDays: next });
  },

  onTimeChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const value = e.detail.value;
    const timePoints = (this.data.timePoints || []).slice(0);
    const prev = timePoints[index] || { time: "08:00", note: "" };
    timePoints[index] = { ...prev, time: value };
    this.setData({ timePoints });
  },

  onNoteInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const note = e.detail.value;
    const timePoints = (this.data.timePoints || []).slice(0);
    const prev = timePoints[index] || { time: "08:00", note: "" };
    timePoints[index] = { ...prev, note };
    this.setData({ timePoints });
  },

  onStartDateChange(e) {
    const startDate = e.detail.value;
    let endDate = this.data.endDate;
    if (endDate && endDate < startDate) endDate = "";
    this.setData({ startDate, endDate });
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
  },

  onSave() {
    // 必须引导用户进行订阅消息授权（不强制必须 accept，但必须调用）
    requestMedicationReminderSubscription().then(() => {
      // ignore result here; server send may fail if user rejects
    });

    const name = String(this.data.name || "").trim();
    if (!name) {
      wx.showToast({ title: "请填写药品名称", icon: "none" });
      return;
    }

    const med = addMedication({
      name,
      amount: this.data.amount,
      unit: this.data.units[this.data.unitIndex] || "粒",
      frequency: Number(this.data.frequency || 1),
      timePoints: this.data.timePoints,
      intervalDays: Number(this.data.intervalDays || 0),
      startDate: this.data.startDate,
      endDate: this.data.endDate,
    });

    if (!med) {
      wx.showToast({ title: "保存失败", icon: "none" });
      return;
    }

    // 同步到云数据库（用于定时提醒）
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
        endDate: med.endDate,
        amount: med.amount,
        unit: med.unit,
        active: med.active,
      },
    }).catch(() => {});

    wx.showToast({ title: "已保存", icon: "success" });
    wx.redirectTo({ url: `/pages/schedule/schedule?focus=${med.id}` });
  },
});
