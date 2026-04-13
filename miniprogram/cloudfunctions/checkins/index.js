const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event && event.action;

  if (action === "set") {
    const taskId = String(event.taskId || "");
    const dateYmd = String(event.dateYmd || "");
    const medClientId = String(event.medClientId || "");
    const time = String(event.time || "");
    const done = !!event.done;
    if (!taskId || !dateYmd) return { ok: false, error: "missing taskId/dateYmd" };

    const existing = await safeWhereGet("checkins", { openid, taskId }, 1);
    if (done) {
      if (existing.data && existing.data.length) return { ok: true, done: true };
      try {
        await db.collection("checkins").add({
          data: {
            openid,
            taskId,
            dateYmd,
            medClientId,
            time,
            createdAt: now(),
          },
        });
      } catch (e) {
        if (isCollectionNotExists(e)) {
          // 集合不存在时，先返回本地已切换状态；建议用户在控制台创建集合
          return { ok: true, done: true, warning: "checkins collection not exists" };
        }
        throw e;
      }
      return { ok: true, done: true };
    }

    if (existing.data && existing.data.length) {
      await db.collection("checkins").doc(existing.data[0]._id).remove();
    }
    return { ok: true, done: false };
  }

  if (action === "listByDate") {
    const dateYmd = String(event.dateYmd || "");
    if (!dateYmd) return { ok: false, error: "missing dateYmd" };
    const res = await safeWhereGet("checkins", { openid, dateYmd }, 500);
    const taskIds = (res.data || []).map((x) => x.taskId);
    return { ok: true, taskIds };
  }

  if (action === "has") {
    const taskId = String(event.taskId || "");
    if (!taskId) return { ok: false, error: "missing taskId" };
    const res = await safeWhereGet("checkins", { openid, taskId }, 1);
    return { ok: true, done: !!(res.data && res.data.length) };
  }

  return { ok: false, error: "unknown action" };
};
