function createId(prefix) {
  const rand = Math.random().toString(16).slice(2, 10);
  const ts = Date.now().toString(16);
  return `${prefix || "id"}_${ts}_${rand}`;
}

module.exports = {
  createId,
};

