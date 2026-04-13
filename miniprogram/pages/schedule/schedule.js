const { todayYmd, formatTodayLabel } = require("../../utils/date");
const {
  loadMedications,
  loadCompleted,
  toggleCompleted,
  buildTodayTasks,
} = require("../../utils/medications");
const { callFunction } = require("../../utils/cloud");

function mapCloudPlanToMed(plan) {
  return {
    id: String(plan.clientId || plan._id || ""),
    name: plan.name,
    frequency: plan.frequency,
    times: plan.times,
    timePoints: plan.timePoints,
    intervalDays: plan.intervalDays,
    startDate: plan.startDate,
    endDate: plan.endDate,
    amount: plan.amount,
    unit: plan.unit,
    active: plan.active !== false,
  };
}

Page({
  data: {
    dateYmd: "",
    dayNum: "",
    dayLabel: "",
    tasks: [],
    progress: 0,
  },

  onLoad() {
    const d = new Date();
    this.setData({
      dateYmd: todayYmd(),
      dayNum: String(d.getDate()),
      dayLabel: formatTodayLabel(),
    });
  },

  onShow() {
    this._refresh();
  },

  async _refresh() {
    const dateYmd = this.data.dateYmd || todayYmd();

    let meds = loadMedications();
    let completed = loadCompleted(dateYmd);

    // 优先使用云端数据（用于定时提醒 + 多端同步），失败则回退本地
    try {
      const plansRes = await callFunction("plans", { action: "list" });
      if (plansRes && plansRes.ok && Array.isArray(plansRes.plans) && plansRes.plans.length) {
        meds = plansRes.plans.map(mapCloudPlanToMed).filter((m) => m.id);
      }
    } catch (e) {}

    try {
      const ckRes = await callFunction("checkins", { action: "listByDate", dateYmd });
      if (ckRes && ckRes.ok && Array.isArray(ckRes.taskIds)) {
        completed = ckRes.taskIds;
      }
    } catch (e) {}

    const tasks = buildTodayTasks(meds, completed, dateYmd);
    const progress = tasks.length
      ? Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100)
      : 0;

    this.setData({ tasks, progress });
  },

  onBack() {
    wx.redirectTo({ url: "/pages/home/home" });
  },

  onAdd() {
    wx.navigateTo({ url: "/pages/add/add" });
  },

  onOpenDetail(e) {
    const id = e.currentTarget.dataset.medid;
    if (!id) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  onToggleDone(e) {
    const taskId = e.currentTarget.dataset.taskid;
    if (!taskId) return;
    const dateYmd = this.data.dateYmd || todayYmd();

    // 本地先切换（即时反馈），再同步云端
    const current = (this.data.tasks || []).find((t) => t.taskId === taskId);
    const nextDone = current ? !current.done : true;
    toggleCompleted(dateYmd, taskId);
    this._refresh();

    callFunction("checkins", {
      action: "set",
      taskId,
      dateYmd,
      medClientId: current ? current.medId : "",
      time: current ? current.time : "",
      done: nextDone,
    })
      .then(() => this._refresh())
      .catch(() => {});
  },

});
