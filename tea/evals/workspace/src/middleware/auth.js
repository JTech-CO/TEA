// Shared-key guard for operational endpoints. When SERVICE_KEY is unset
// (local development), the guard lets requests through.
function requireKey(handler) {
  return (req, res) => {
    const expected = process.env.SERVICE_KEY;
    if (expected && req.headers['x-service-key'] !== expected) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing or wrong service key' }));
      return;
    }
    return handler(req, res);
  };
}

module.exports = { requireKey };
