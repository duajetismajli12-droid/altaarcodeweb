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

    const name = String(body.name || '').trim().slice(0, 80);
    const phone = String(body.phone || '').trim().slice(0, 120);
    const unit = String(body.unit || body.apt || 'General Consultation').trim().slice(0, 120);
    const type = String(body.type || body.tourType || 'In-Person VIP Showroom Tour').trim().slice(0, 120);
    const date = String(body.date || new Date().toISOString().slice(0, 10)).trim().slice(0, 40);

    if (!name || !phone) {
      return json(res, 400, { ok: false, error: 'Name and phone are required' });
    }

    const result = await getSiteData(req);
    const data = result.data || result;
    const leads = Array.isArray(data.leads) ? data.leads : [];
    const item = {
      id: Date.now(),
      date,
      name,
      phone,
      unit,
      type,
      status: 'New'
    };
    leads.unshift(item);
    data.leads = leads;
    const saved = await saveSiteData(data, req);
    return json(res, 200, {
      ok: true,
      lead: item,
      updatedAt: saved.updatedAt,
      storeId: saved.storeId || null
    });
  } catch (err) {
    console.error(err);
    return json(res, 500, { ok: false, error: err.message || 'Server error' });
  }
};
