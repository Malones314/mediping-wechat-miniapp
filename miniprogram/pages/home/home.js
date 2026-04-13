Page({
  data: {
    greeting: "你好",
  },

  onLoad() {
    this._refreshGreeting();
  },

  onShow() {
    this._refreshGreeting();
  },

  _refreshGreeting() {
    const h = new Date().getHours();
    let greeting = "你好";
    if (h >= 5 && h < 11) greeting = "早安";
    else if (h >= 11 && h < 13) greeting = "中午好";
    else if (h >= 13 && h < 18) greeting = "下午好";
    else if (h >= 18 && h < 23) greeting = "晚上好";
    else greeting = "夜深了";
    this.setData({ greeting });
  },

  onGo(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url });
  },
});
