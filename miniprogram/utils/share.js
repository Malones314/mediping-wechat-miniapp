function encodeSharePayload(payload) {
  const json = JSON.stringify(payload || {});
  return `MEDPLAN:${encodeURIComponent(json)}`;
}

function decodeSharePayload(text) {
  const raw = String(text || "").trim();
  if (!raw.startsWith("MEDPLAN:")) return null;
  const json = decodeURIComponent(raw.slice("MEDPLAN:".length));
  return JSON.parse(json);
}

module.exports = {
  encodeSharePayload,
  decodeSharePayload,
};

