const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isCollectionNotExists(err) {
  const msg = String((err && (err.errMsg || err.message)) || "");
  return msg.includes("DATABASE_COLLECTION_NOT_EXIST") || msg.includes("collection not exists") || msg.includes("-502005");
}

// 为避免运行环境时区不一致，这里统一按北京时间(+8)计算
function chinaDate(ms) {
  const t = typeof ms === "number" ? ms : Date.now();
  return new Date(t + 8 * 3600 * 1000);
}

function ymd(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function hm(d) {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function parseYmdToUtcDay(ymdStr) {
  const s = String(ymdStr || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 86400000);
}

function isDueToday(plan, dateYmd) {
  if (!plan || plan.active === false) return false;
  if (plan.startDate && plan.startDate > dateYmd) return false;
  if (plan.endDate && plan.endDate < dateYmd) return false;

  const intervalDays = Math.max(0, Math.min(30, Number(plan.intervalDays || 0)));
  const interval = intervalDays + 1; // 0=每天，1=隔一天 => 周期=2
  const startDay = parseYmdToUtcDay(plan.startDate || "");
  const todayDay = parseYmdToUtcDay(dateYmd || "");
  if (startDay === null || todayDay === null) return false;
  const diff = todayDay - startDay;
  if (diff < 0) return false;
  return diff % interval === 0;
}

async function getAllActivePlans() {
  const plans = [];
  const limit = 100;
  let offset = 0;
  // 简单分页（适合小规模；如量大建议加索引与更精确的筛选字段）
  while (true) {
    let res;
    try {
      res = await db
        .collection("plans")
        .where({ active: true })
        .skip(offset)
        .limit(limit)
        .get();
    } catch (e) {
      if (isCollectionNotExists(e)) return [];
      throw e;
    }
    const batch = res.data || [];
    plans.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return plans;
}

async function cleanupEndedPlans(nowMs) {
  const threshold = nowMs - 7 * 86400000;
  const limit = 100;
  let removed = 0;

  // 分批删除 endedAt 超过 7 天且 inactive 的计划
  while (true) {
    let batch;
    try {
      const res = await db
        .collection("plans")
        .where({
          active: false,
          endedAt: _.lt(threshold),
        })
        .limit(limit)
        .get();
      batch = res.data || [];
    } catch (e) {
      if (isCollectionNotExists(e)) return { removed: 0 };
      throw e;
    }

    if (!batch.length) break;

    for (const doc of batch) {
      try {
        await db.collection("plans").doc(doc._id).remove();
        removed += 1;
      } catch (e) {
        // ignore
      }
    }

    if (batch.length < limit) break;
  }

  return { removed };
}

exports.main = async (event) => {
  const d = chinaDate();
  const dateYmd = ymd(d);
  const time = hm(d);
  const nowMs = Date.now();

  const templateId = String(
    (event && event.templateId) || process.env.SUBSCRIBE_TEMPLATE_ID || ""
  );
  if (!templateId) {
    // 未配置模板时不发送（开源默认），避免定时器报错刷屏
    return { ok: true, skipped: true, reason: "missing templateId" };
  }

  // 每天凌晨 03:05 执行一次清理：已结束超过 7 天的提醒
  let cleaned = 0;
  if (time === "03:05") {
    try {
      const res = await cleanupEndedPlans(nowMs);
      cleaned = res.removed || 0;
    } catch (e) {}
  }

  const plans = await getAllActivePlans();
  const due = plans.filter((p) => {
    if (!p || !p.openid) return false;
    if (!Array.isArray(p.times) || p.times.indexOf(time) < 0) return false;
    return isDueToday(p, dateYmd);
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of due) {
    const clientId = String(p.clientId || "");
    if (!clientId) continue;

    const taskId = `${clientId}-${dateYmd}-${time}`;
    const openid = String(p.openid || "");

    // 已打卡则跳过
    try {
      const ck = await db.collection("checkins").where({ openid, taskId }).limit(1).get();
      if (ck.data && ck.data.length) {
        skipped += 1;
        continue;
      }
    } catch (e) {
      if (!isCollectionNotExists(e)) throw e;
      // 没有 checkins 集合时当作未打卡（后续会发送），并提示用户先建集合
    }

    // 已发送过同一条提醒则跳过，避免刷屏
    const sendId = `${openid}_${taskId}`;
    // 先落库占位，避免并发重复发送（如已存在会抛错，直接跳过）
    try {
      await db.collection("reminder_sends").add({
        data: {
          _id: sendId,
          openid,
          taskId,
          dateYmd,
          time,
          createdAt: Date.now(),
        },
      });
    } catch (e) {
      skipped += 1;
      continue;
    }

    try {
      // 注意：data 的字段 key 必须与你在后台配置的订阅消息模板字段一致
      const tps = Array.isArray(p.timePoints) && p.timePoints.length
        ? p.timePoints
        : (Array.isArray(p.times) ? p.times : []).map((t) => ({ time: t, note: "" }));
      const tp = tps.find((x) => x && x.time === time);
      const note = tp && tp.note ? String(tp.note) : "";
      const doseText = `${String(p.amount || "1")}${String(p.unit || "")}`;

      await cloud.openapi.subscribeMessage.send({
        touser: openid,
        templateId,
        page: "pages/schedule/schedule",
        data: {
          // 药品名：{{thing2.DATA}}
          thing2: { value: String(p.name || "用药提醒").slice(0, 20) },
          // 时间：{{time3.DATA}}
          time3: { value: `${dateYmd} ${time}`.slice(0, 20) },
          // 剂量：{{short_thing11.DATA}}
          short_thing11: { value: doseText.slice(0, 20) },
          // 每日时间点：{{time10.DATA}}
          time10: { value: String(time).slice(0, 20) },
          // 医嘱事项：{{thing4.DATA}}
          thing4: { value: (note || "无").slice(0, 20) },
        },
        miniprogramState: "formal",
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      // 发送失败也保留 reminder_sends，避免每分钟重复失败刷屏
    }
  }

  return { ok: true, dateYmd, time, cleaned, due: due.length, sent, skipped, failed };
};
