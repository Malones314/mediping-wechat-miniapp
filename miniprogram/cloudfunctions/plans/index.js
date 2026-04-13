const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function now() {
  return Date.now();
}

function isCollectionNotExists(err) {
  const msg = String((err && (err.errMsg || err.message)) || "");
  return msg.includes("DATABASE_COLLECTION_NOT_EXIST") || msg.includes("collection not exists") || msg.includes("-502005");
}

async function safeWhereGet(collectionName, where, limit) {
  try {
    return await db.collection(collectionName).where(where).limit(limit || 100).get();
  } catch (e) {
    if (isCollectionNotExists(e)) return { data: [] };
    throw e;
  }
}

async function safeRemoveWhere(collectionName, where) {
  try {
    return await db.collection(collectionName).where(where).remove();
  } catch (e) {
    if (isCollectionNotExists(e)) return { stats: { removed: 0 } };
    throw e;
  }
}

async function safeRemoveRegex(collectionName, field, regexp) {
  try {
    return await db
      .collection(collectionName)
      .where({
        [field]: _.regexp({
          regexp,
          options: "i",
        }),
      })
      .remove();
  } catch (e) {
    if (isCollectionNotExists(e)) return { stats: { removed: 0 } };
    throw e;
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event && event.action;

  if (action === "upsert") {
    const med = event.med || {};
    const clientId = String(med.clientId || "");
    if (!clientId) return { ok: false, error: "missing clientId" };

    const timePointsIn = Array.isArray(med.timePoints) ? med.timePoints : null;
    const timesIn = Array.isArray(med.times) ? med.times : ["08:00"];
    const timePoints = [];
    if (timePointsIn) {
      for (const tp of timePointsIn) {
        if (!tp) continue;
        const time = String(tp.time || "").trim() || "08:00";
        const note = String(tp.note || "");
        timePoints.push({ time, note });
      }
    } else {
      for (const t of timesIn) timePoints.push({ time: String(t || "").trim() || "08:00", note: "" });
    }
    const times = timePoints.map((tp) => tp.time);

    const doc = {
      openid,
      clientId,
      name: String(med.name || "").trim(),
      frequency: Number(med.frequency || 1),
      times,
      timePoints,
      intervalDays: Number(med.intervalDays || 0),
      startDate: String(med.startDate || ""),
      endDate: String(med.endDate || ""),
      endedAt: med.active === false ? Number(med.endedAt || now()) : 0,
      amount: String(med.amount || "1"),
      unit: String(med.unit || "粒"),
      active: med.active !== false,
      updatedAt: now(),
    };

    const existing = await safeWhereGet("plans", { openid, clientId }, 1);

    if (existing.data && existing.data.length) {
      await db.collection("plans").doc(existing.data[0]._id).update({ data: doc });
      return { ok: true, updated: true };
    }

    await db.collection("plans").add({
      data: {
        ...doc,
        createdAt: now(),
      },
    });
    return { ok: true, created: true };
  }

  if (action === "batchUpsert") {
    const meds = Array.isArray(event.meds) ? event.meds : [];
    let ok = 0;
    for (const m of meds) {
      const res = await exports.main({ action: "upsert", med: m }, context);
      if (res && res.ok) ok += 1;
    }
    return { ok: true, count: ok };
  }

  if (action === "list") {
    const res = await safeWhereGet("plans", { openid }, 500);
    return { ok: true, plans: res.data || [] };
  }

  if (action === "getByClientId") {
    const clientId = String(event.clientId || "");
    if (!clientId) return { ok: false, error: "missing clientId" };
    const res = await safeWhereGet("plans", { openid, clientId }, 1);
    return { ok: true, plan: (res.data && res.data[0]) || null };
  }

  if (action === "deleteByClientId") {
    const clientId = String(event.clientId || "");
    if (!clientId) return { ok: false, error: "missing clientId" };
    const planRes = await safeRemoveWhere("plans", { openid, clientId });
    // 关联清理（尽力而为）
    const checkinsRes = await safeRemoveWhere("checkins", { openid, medClientId: clientId });
    const sendsRes = await safeRemoveRegex("reminder_sends", "taskId", `^${clientId}-`);
    return {
      ok: true,
      removed: (planRes && planRes.stats && planRes.stats.removed) || 0,
      removedCheckins: (checkinsRes && checkinsRes.stats && checkinsRes.stats.removed) || 0,
      removedReminderSends: (sendsRes && sendsRes.stats && sendsRes.stats.removed) || 0,
    };
  }

  return { ok: false, error: "unknown action" };
};
