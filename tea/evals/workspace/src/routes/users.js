const { upsertUser, getUser } = require('../db');

function readBody(req, callback) {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    try {
      callback(null, JSON.parse(raw || '{}'));
    } catch (e) {
      callback(e);
    }
  });
}

function respond(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function handleUsers(req, res) {
  if (req.method === 'POST') {
    readBody(req, (err, body) => {
      if (err) return respond(res, 400, { error: 'invalid json' });
      if (!body.id || typeof body.id !== 'string') {
        return respond(res, 400, { error: 'id is required' });
      }
      if (!body.email || typeof body.email !== 'string' || !body.email.includes('@')) {
        return respond(res, 400, { error: 'valid email is required' });
      }
      if (body.tier && !['guest', 'silver', 'gold'].includes(body.tier)) {
        return respond(res, 400, { error: 'tier must be guest, silver, or gold' });
      }
      return respond(res, 201, upsertUser({ id: body.id, email: body.email, tier: body.tier || 'guest' }));
    });
    return;
  }
  if (req.method === 'GET') {
    const idMatch = req.url.match(/^\/users\/([\w-]+)$/);
    if (idMatch) {
      const user = getUser(idMatch[1]);
      if (!user) return respond(res, 404, { error: 'user not found' });
      return respond(res, 200, user);
    }
  }
  return respond(res, 405, { error: 'method not allowed' });
}

module.exports = { handleUsers };
