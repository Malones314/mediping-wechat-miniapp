const defaults = {
  // 云开发环境 ID（微信开发者工具 - 云开发控制台可见）
  // 不使用云开发时可留空：""
  envId: "",

  // 订阅消息模板 ID（小程序后台 - 订阅消息里配置）
  // 录入、导入计划时会调用 requestSubscribeMessage 引导用户授权
  subscribeTemplateIds: [],

  // 分享链接默认落地页
  shareImportPath: "pages/import/import",
};

let local = {};
try {
  // 将真实配置放到 config.local.js（建议加入 .gitignore，不要提交到仓库）
  // module.exports = { envId: "...", subscribeTemplateIds: ["..."] }
  local = require("./config.local");
} catch (e) {}

module.exports = { ...defaults, ...(local || {}) };
