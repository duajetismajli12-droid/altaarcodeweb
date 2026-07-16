const { getAdminPassword, json, readBody } = require('../lib/store');

function safeEq(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  let out = 0;
  for (let i = 0; i < x.length; i++) out |= x[i] ^ y[i];
  return out === 0;
}

/**
 * POST /api/auth  { password: "..." }
 * Returns a token used for subsequent admin API writes.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const body = await readBody(req);
    const password = (body.password || body.pin || '').toString().trim();
    const expected = getAdminPassword();

    if (!password) {
      return json(res, 400, { ok: false, error: 'Password is required' });
    }

    if (!expected) {
      return json(res, 503, {
        ok: false,
        error: 'Could not read ALTAAR_ADMIN_PASSWORD from index.html'
      });
    }

    // Password is read from index.html (ALTAAR_ADMIN_PASSWORD) only
    const ok = safeEq(password, expected);
    if (!ok) {
      return json(res, 401, {
        ok: false,
        error: 'Invalid password. Check ALTAAR_ADMIN_PASSWORD in index.html only.'
      });
    }

    return json(res, 200, {
      ok: true,
      token: expected,
      message: 'Admin authenticated'
    });
  } catch (err) {
    console.error('auth error', err);
    return json(res, 500, { ok: false, error: err.message || 'Server error' });
  }
};
