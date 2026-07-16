const {
  getSiteData,
  saveSiteData,
  isAuthorized,
  json,
  readBody,
  getBlobToken,
  getCloudStoreId
} = require('../lib/store');

/**
 * GET  /api/data  → public site data (shared for all visitors)
 * PUT  /api/data  → admin save
 * POST /api/data  → same as PUT
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token, X-Cloud-Store-Id, X-Altaar-Store-Id'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    if (req.method === 'GET') {
      const result = await getSiteData(req);
      const data = result.data || result;
      return json(res, 200, {
        ok: true,
        storage: result.storage || 'unknown',
        storeId: result.storeId || getCloudStoreId(req) || null,
        blobConfigured: !!getBlobToken(),
        data
      });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      if (!isAuthorized(req)) {
        return json(res, 401, {
          ok: false,
          error: 'Unauthorized. Log in with the password from index.html (ALTAAR_ADMIN_PASSWORD).'
        });
      }

      let body;
      try {
        body = await readBody(req);
      } catch (e) {
        return json(res, 400, { ok: false, error: 'Invalid JSON body: ' + e.message });
      }

      const incoming = body.data || body;
      if (!incoming || typeof incoming !== 'object') {
        return json(res, 400, { ok: false, error: 'Invalid payload' });
      }

      // Allow client to pass store id in body too
      if (body.storeId && !req.headers['x-cloud-store-id']) {
        req.headers['x-cloud-store-id'] = String(body.storeId);
      }

      try {
        const saved = await saveSiteData(
          {
            apartments: incoming.apartments ?? null,
            projects: incoming.projects ?? null,
            galleryItems: incoming.galleryItems ?? null,
            newsItems: incoming.newsItems ?? null,
            features: incoming.features ?? null,
            proximityItems: incoming.proximityItems ?? null,
            reviews: incoming.reviews ?? null,
            floorPlans: incoming.floorPlans ?? null,
            leads: incoming.leads ?? null,
            siteSettings: incoming.siteSettings ?? null
          },
          req
        );

        return json(res, 200, {
          ok: true,
          data: saved,
          updatedAt: saved.updatedAt,
          storage: saved.storage || null,
          storeId: saved.storeId || null,
          createdStoreId: !!saved.createdStoreId,
          // If a new free store was created, tell admin to paste this into index.html
          setupHint: saved.createdStoreId
            ? `IMPORTANT: put this in index.html so ALL visitors load your data:\nvar ALTAAR_CLOUD_STORE_ID = '${saved.storeId}';`
            : null
        });
      } catch (saveErr) {
        console.error('saveSiteData failed:', saveErr);
        return json(res, 500, {
          ok: false,
          error: saveErr.message || 'Save failed',
          code: saveErr.code || 'SAVE_FAILED',
          help:
            'Option A: Vercel Storage → Blob → Connect → Redeploy. Option B: Publish once, then paste ALTAAR_CLOUD_STORE_ID into index.html and redeploy.'
        });
      }
    }

    return json(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('api/data fatal:', err);
    return json(res, 500, { ok: false, error: err.message || 'Server error' });
  }
};
