function logEvento({
  level = "INFO",
  requestId = null,
  method = null,
  route = null,
  status = null,
  durationMs = null,
  dbDurationMs = null,
  message = null
}) {
  const evento = {
    timestamp: new Date().toISOString(),
    service: "mugiwaras-api",
    level,
    requestId,
    method,
    route,
    status,
    durationMs,
    dbDurationMs,
    message
  };

  // Uma única linha JSON no stdout
  process.stdout.write(JSON.stringify(evento) + "\n");
}

module.exports = { logEvento };