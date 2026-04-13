# 云函数说明

本目录包含小程序云开发（CloudBase）云函数：

- `plans`：保存/读取用药计划（数据库集合：`plans`）
- `checkins`：打卡记录（数据库集合：`checkins`）
- `share`：生成/解析分享链接（数据库集合：`shares`）
- `reminderScheduler`：定时扫描并发送订阅消息提醒（数据库集合：`reminder_sends`）

## 需要你配置

1. 在 `miniprogram/config.local.js` 填写 `envId`
2. 在小程序后台创建订阅消息模板，并在 `miniprogram/config.local.js` 填写模板 ID
3. 在 `cloudfunctions/reminderScheduler/index.js` 按你的模板字段，调整 `data` 的 key（如 `thing1`、`time2` 等），并配置模板 ID（可直接改代码，或设置云函数环境变量 `SUBSCRIBE_TEMPLATE_ID`）
