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
    return await db.collection(collectionName).where(where).limit(limit || 1).get();
  } catch (e) {
    if (isCollectionNotExists(e)) return { data: [] };
    throw e;
  }
}

function randomCode(len) {
  const chars = "23456789abcdefghjkmnpqrstuvwxyz";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

exports.main = async (event) => {
  const action = event && event.action;

  if (action === "generate") {
    const payload = event.payload || {};
    const ttlDays = Number(event.ttlDays || 7);
    const expiresAt = now() + Math.max(1, Math.min(ttlDays, 30)) * 86400000;

    let code = randomCode(10);
    // 尝试避免碰撞（小规模足够）
    for (let i = 0; i < 3; i++) {
      const exists = await safeWhereGet("shares", { code }, 1);
      if (!exists.data || !exists.data.length) break;
      code = randomCode(10);
    }

    await db.collection("shares").add({
      data: {
        code,
        payload,
        expiresAt,
        createdAt: now(),
      },
    });

    return {
      ok: true,
      code,
      path: `/pages/import/import?shareCode=${code}`,
    };
  }

  if (action === "parse") {
    const code = String(event.code || "");
    if (!code) return { ok: false, error: "missing code" };
    const res = await safeWhereGet("shares", { code }, 1);
    const doc = res.data && res.data[0];
    if (!doc) return { ok: false, error: "not found" };
    if (doc.expiresAt && now() > doc.expiresAt) return { ok: false, error: "expired" };
    return { ok: true, payload: doc.payload || null };
  }

  return { ok: false, error: "unknown action" };
};
