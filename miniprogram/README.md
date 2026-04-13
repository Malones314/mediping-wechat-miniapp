# 用药提醒（微信小程序）

此目录为可直接导入微信开发者工具运行的版本（不依赖构建流程）。

## 打开方式

1. 打开「微信开发者工具」
2. 选择「导入项目」
3. 项目目录选择本文件所在目录（`miniprogram`）
4. AppID 可先选「测试号 / 旅游模式（touristappid）」或替换为你自己的小程序 AppID

## 主要页面

- 首页：`pages/home/home`
- 录入：`pages/add/add`
- 导入：`pages/import/import`
- 今日用药：`pages/schedule/schedule`
- 详情：`pages/detail/detail`

## 数据存储

- 用药数据：`wx.setStorageSync('medications_v1', ...)`
- 今日完成项：`wx.setStorageSync('completed_v1_YYYY-MM-DD', ...)`

## 云开发（订阅消息提醒）

本项目已添加云函数与定时触发器，用于订阅消息提醒：

- 云函数目录：`cloudfunctions`
- 计划集合：`plans`，打卡集合：`checkins`，分享集合：`shares`，发送去重集合：`reminder_sends`

需要你做的配置：

1. 创建 `config.local.js`（不要提交到仓库），填入 `envId` 与订阅模板 ID（示例见 `config.js` 注释）
2. 在微信开发者工具中开启云开发并部署云函数（`plans` / `checkins` / `share` / `reminderScheduler`）
3. 按你的模板字段调整 `cloudfunctions/reminderScheduler/index.js` 里 `data` 的 key（本项目当前默认映射：`thing2/time3/short_thing11/time10/thing4`）

交互约束：

- 用户在“录入计划”“导入计划”时，会调用 `wx.requestSubscribeMessage` 引导授权；若拒绝，计划仍可保存，但云端推送会失败。
