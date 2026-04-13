const config = require("../config");

function requestMedicationReminderSubscription() {
  return new Promise((resolve) => {
    const tmplIds = config.subscribeTemplateIds || [];
    if (!tmplIds.length) {
      wx.showToast({ title: "未配置订阅模板ID", icon: "none" });
      resolve({ ok: false, detail: null });
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        // res: { [tmplId]: 'accept' | 'reject' | 'ban' }
        const accepted = tmplIds.some((id) => res && res[id] === "accept");
        resolve({ ok: accepted, detail: res || null });
      },
      fail: (err) => {
        resolve({ ok: false, detail: err || null });
      },
    });
  });
}

module.exports = {
  requestMedicationReminderSubscription,
};

