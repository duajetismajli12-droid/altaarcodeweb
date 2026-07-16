const { getSiteData, saveSiteData, json, readBody } = require('../lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cloud-Store-Id, X-Altaar-Store-Id');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const body = await readBody(req);
    if (body.storeId) req.headers['x-cloud-store-id'] = String(body.storeId);

    const firstName = String(body.firstName || '').trim().slice(0, 40);
    const lastName = String(body.lastName || '').trim().slice(0, 40);
    const message = String(body.message || '').trim().slice(0, 800);
    const rating = parseInt(body.rating, 10);

    if (!firstName || !lastName || !message || !(rating >= 1 && rating <= 5)) {
      return json(res, 400, { ok: false, error: 'Invalid review fields' });
    }

    const result = await getSiteData(req);
    const data = result.data || result;
    const reviews = Array.isArray(data.reviews) ? data.reviews : [];
    const item = {
      id: Date.now(),
      firstName,
      lastName,
      rating,
      message,
      date: new Date().toISOString().slice(0, 10),
      status: 'pending'
    };
    reviews.unshift(item);
    data.reviews = reviews;
    const saved = await saveSiteData(data, req);
    return json(res, 200, {
      ok: true,
      review: item,
      updatedAt: saved.updatedAt,
      storeId: saved.storeId || null
    });
  } catch (err) {
    console.error(err);
    return json(res, 500, { ok: false, error: err.message || 'Server error' });
  }
};
