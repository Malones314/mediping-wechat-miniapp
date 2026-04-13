const { createId } = require("./ids");
const { todayYmd } = require("./date");

const MEDS_KEY = "medications_v1";
const DONE_KEY_PREFIX = "completed_v1_";

function parseYmdToUtcDay(ymd) {
  const s = String(ymd || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 86400000);
}

function loadMedications() {
  const list = wx.getStorageSync(MEDS_KEY);
  return Array.isArray(list) ? list : [];
}

function saveMedications(list) {
  wx.setStorageSync(MEDS_KEY, list || []);
}

function normalizeFrequency(input) {
  const raw = Number(input);
  return Math.max(1, Math.min(10, Number.isFinite(raw) ? raw : 1));
}

function normalizeIntervalDays(input) {
  const raw = Number(input);
  return Math.max(0, Math.min(30, Number.isFinite(raw) ? raw : 0));
}

function normalizeTimePoints({ timePoints, times, frequency }) {
  const tps = [];
  if (Array.isArray(timePoints) && timePoints.length) {
    for (const tp of timePoints) {
      if (!tp) continue;
      const time = String(tp.time || "").trim() || "08:00";
      const note = String(tp.note || "");
      tps.push({ time, note });
    }
  } else if (Array.isArray(times) && times.length) {
    for (const t of times) tps.push({ time: String(t || "").trim() || "08:00", note: "" });
  }

  while (tps.length < frequency) tps.push({ time: "08:00", note: "" });
  if (tps.length > frequency) tps.length = frequency;
  tps.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return tps;
}

function addMedication(input) {
  const now = Date.now();
  const name = String((input && input.name) || "").trim();
  if (!name) return null;

  const frequency = normalizeFrequency(input && input.frequency);
  const intervalDays = normalizeIntervalDays(input && input.intervalDays);

  const startDate = String((input && input.startDate) || "") || todayYmd();
  let endDate = String((input && input.endDate) || "");
  if (endDate && endDate < startDate) endDate = "";

  const timePoints = normalizeTimePoints({
    timePoints: input && input.timePoints,
    times: input && input.times,
    frequency,
  });
  const times = timePoints.map((tp) => tp.time);

  const med = {
    id: createId("med"),
    name,
    frequency,
    intervalDays,
    startDate,
    endDate,
    amount: String((input && input.amount) || "1"),
    unit: String((input && input.unit) || "粒"),
    active: true,
    endedAt: 0,
    times, // 兼容字段：仅时间字符串数组
    timePoints, // 新字段：每个时间点含备注
    createdAt: now,
    updatedAt: now,
  };

  const list = loadMedications();
  list.unshift(med);
  saveMedications(list);
  return med;
}

function updateMedication(id, patch) {
  const list = loadMedications();
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return null;

  const prev = list[idx];
  const merged = { ...prev, ...(patch || {}) };

  const frequency = normalizeFrequency(merged.frequency);
  const intervalDays = normalizeIntervalDays(merged.intervalDays);

  const startDate = String(merged.startDate || "");
  let endDate = String(merged.endDate || "");
  if (endDate && startDate && endDate < startDate) endDate = "";

  const timePoints = normalizeTimePoints({
    timePoints: merged.timePoints,
    times: merged.times,
    frequency,
  });
  const times = timePoints.map((tp) => tp.time);

  const active = merged.active !== false;
  const endedAt = active ? 0 : Number(merged.endedAt || Date.now());

  const next = {
    ...merged,
    frequency,
    intervalDays,
    startDate,
    endDate,
    active,
    endedAt,
    timePoints,
    times,
    updatedAt: Date.now(),
  };

  list[idx] = next;
  saveMedications(list);
  return next;
}

function endMedication(id, endDateYmd) {
  return updateMedication(id, {
    active: false,
    endDate: endDateYmd || "",
    endedAt: Date.now(),
  });
}

function deleteMedication(id) {
  const list = loadMedications();
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  const removed = list.splice(idx, 1)[0];
  saveMedications(list);
  return removed;
}

function loadCompleted(dateYmd) {
  const key = `${DONE_KEY_PREFIX}${dateYmd}`;
  const list = wx.getStorageSync(key);
  return Array.isArray(list) ? list : [];
}

function saveCompleted(dateYmd, list) {
  const key = `${DONE_KEY_PREFIX}${dateYmd}`;
  wx.setStorageSync(key, list || []);
}

function toggleCompleted(dateYmd, taskId) {
  const list = loadCompleted(dateYmd);
  const idx = list.indexOf(taskId);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(taskId);
  saveCompleted(dateYmd, list);
  return list;
}

function buildTodayTasks(medications, completedTaskIds, dateYmd) {
  const tasks = [];
  (medications || []).forEach((m) => {
    if (!m || m.active === false) return;
    if (m.startDate && m.startDate > dateYmd) return;
    if (m.endDate && m.endDate < dateYmd) return;

    const intervalDays = normalizeIntervalDays(m.intervalDays);
    const interval = intervalDays + 1; // 0=每天，1=隔一天 => 周期=2

    const startDay = parseYmdToUtcDay(m.startDate || "");
    const todayDay = parseYmdToUtcDay(dateYmd || "");
    if (startDay === null || todayDay === null) return;
    const diff = todayDay - startDay;
    if (diff < 0) return;
    if (diff % interval !== 0) return;

    const tps = normalizeTimePoints({
      timePoints: m.timePoints,
      times: m.times,
      frequency: normalizeFrequency(m.frequency),
    });

    tps.forEach((tp) => {
      const time = String((tp && tp.time) || "").trim();
      if (!time) return;
      const note = String((tp && tp.note) || "");
      const taskId = `${m.id}-${dateYmd}-${time}`;
      tasks.push({
        taskId,
        medId: m.id,
        time,
        name: m.name,
        desc: `${m.amount} ${m.unit}`,
        note,
        done: (completedTaskIds || []).indexOf(taskId) >= 0,
      });
    });
  });

  tasks.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return tasks;
}

module.exports = {
  MEDS_KEY,
  loadMedications,
  saveMedications,
  addMedication,
  updateMedication,
  endMedication,
  deleteMedication,
  loadCompleted,
  toggleCompleted,
  buildTodayTasks,
};

