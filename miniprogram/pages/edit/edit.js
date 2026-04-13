const { todayYmd } = require("../../utils/date");
const { loadMedications, updateMedication } = require("../../utils/medications");
const { callFunction } = require("../../utils/cloud");

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeLocalMed(raw) {
  if (!raw) return null;
  const times = Array.isArray(raw.times) ? raw.times : ["08:00"];
  const timePoints = Array.isArray(raw.timePoints) && raw.timePoints.length
    ? raw.timePoints
    : times.map((t) => ({ time: t, note: "" }));
  return {
    id: raw.id,
    name: String(raw.name || ""),
    amount: String(raw.amount || "1"),
    unit: String(raw.unit || "粒"),
    units: ["粒", "片", "mg", "ml", "袋", "支"],
    unitIndex: 0,
    frequency: clamp(Number(raw.frequency || 1), 1, 10),
    intervalDays: clamp(Number(raw.intervalDays || 0), 0, 30),
    timePoints,
    startDate: String(raw.startDate || todayYmd()),
    endDate: String(raw.endDate || ""),
  };
}

Page({
  data: {
    id: "",
    name: "",
    amount: "1",
    units: ["粒", "片", "mg", "ml", "袋", "支"],
    unitIndex: 0,
    frequency: 1,
    intervalDays: 0,
    timePoints: [{ time: "08:00", note: "" }],
    startDate: todayYmd(),
    endDate: "",
  },

  onLoad(options) {
    const id = options && options.id ? String(options.id) : "";
    this.setData({ id });
    this._loadMed(id);
  },

  async _loadMed(id) {
    const meds = loadMedications();
    const local = meds.find((m) => m.id === id);
    const med = normalizeLocalMed(local);
    if (med) {
      const unitIndex = Math.max(0, med.units.indexOf(med.unit));
      this.setData({ ...med, unitIndex: unitIndex >= 0 ? unitIndex : 0 });
      return;
    }

    // 云端兜底
    try {
      const res = await callFunction("plans", { action: "getByClientId", clientId: id });
      if (res && res.ok && res.plan) {
        const p = res.plan;
        const mapped = normalizeLocalMed({
          id,
          name: p.name,
          amount: p.amount,
          unit: p.unit,
          frequency: p.frequency,
          intervalDays: p.intervalDays,
          times: p.times,
          timePoints: p.timePoints,
          startDate: p.startDate,
          endDate: p.endDate,
        });
        const unitIndex = Math.max(0, mapped.units.indexOf(mapped.unit));
        this.setData({ ...mapped, unitIndex: unitIndex >= 0 ? unitIndex : 0 });
      }
    } catch (e) {}
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

  _syncTimePointsWithFrequency(nextFreq) {
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
    this._syncTimePointsWithFrequency(next);
  },
  onFreqPlus() {
    const next = clamp(Number(this.data.frequency || 1) + 1, 1, 10);
    this._syncTimePointsWithFrequency(next);
  },
  onFreqInput(e) {
    const val = parseInt(e.detail.value, 10);
    const next = clamp(Number.isFinite(val) ? val : 1, 1, 10);
    this._syncTimePointsWithFrequency(next);
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
    const id = String(this.data.id || "");
    const name = String(this.data.name || "").trim();
    if (!id) {
      wx.showToast({ title: "缺少ID", icon: "none" });
      return;
    }
    if (!name) {
      wx.showToast({ title: "请填写药品名称", icon: "none" });
      return;
    }

    const unit = this.data.units[this.data.unitIndex] || "粒";
    const patch = {
      name,
      amount: this.data.amount,
      unit,
      frequency: Number(this.data.frequency || 1),
      intervalDays: Number(this.data.intervalDays || 0),
      timePoints: this.data.timePoints,
      startDate: this.data.startDate,
      endDate: this.data.endDate,
    };

    const updated = updateMedication(id, patch);
    if (!updated) {
      wx.showToast({ title: "保存失败", icon: "none" });
      return;
    }

    callFunction("plans", {
      action: "upsert",
      med: {
        clientId: updated.id,
        name: updated.name,
        frequency: updated.frequency,
        times: updated.times,
        timePoints: updated.timePoints,
        intervalDays: updated.intervalDays,
        startDate: updated.startDate,
        endDate: updated.endDate,
        amount: updated.amount,
        unit: updated.unit,
        active: updated.active,
      },
    }).catch(() => {});

    wx.showToast({ title: "已保存", icon: "success" });
    wx.redirectTo({ url: `/pages/detail/detail?id=${id}` });
  },
});

