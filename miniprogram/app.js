const config = require("./config");

App({
  onLaunch() {
    if (wx.cloud) {
      const opts = { traceUser: true };
      if (config && config.envId) opts.env = config.envId;
      wx.cloud.init(opts);
    }
  },
  globalData: {
    version: "1.0.0",
  },
});
