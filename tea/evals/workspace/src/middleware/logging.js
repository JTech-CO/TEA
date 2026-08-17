// Request logging wrapper for the top-level dispatcher.
const { nextRequestId } = require('../utils/ids');
const { nowMs } = require('../utils/clock');

function withLogging(handler) {
  return (req, res) => {
    const id = nextRequestId();
    const started = nowMs();
    res.on('finish', () => {
      console.log(`[req] ${id} ${req.method} ${req.url} -> ${res.statusCode} ${nowMs() - started}ms`);
    });
    return handler(req, res);
  };
}

module.exports = { withLogging };
