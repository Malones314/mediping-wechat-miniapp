function callFunction(name, data) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      reject(new Error("wx.cloud not available"));
      return;
    }
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => resolve(res.result),
      fail: (err) => reject(err),
    });
  });
}

module.exports = {
  callFunction,
};

