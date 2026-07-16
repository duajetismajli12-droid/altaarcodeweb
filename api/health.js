const { getAdminPassword, json, getBlobToken, getCloudStoreId } = require('../lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cloud-Store-Id');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const blob = !!getBlobToken();
  const storeId = getCloudStoreId(req) || '';
  const hasPass = !!getAdminPassword();

  return json(res, 200, {
    ok: true,
    service: 'altaar-api',
    adminPasswordConfigured: hasPass,
    adminPasswordSource: 'index.html → ALTAAR_ADMIN_PASSWORD',
    blobConfigured: blob,
    jsonblobStoreId: storeId || null,
    cloudPublishReady: blob || !!storeId || true, // jsonblob can create store on first publish
    vercelEnv: process.env.VERCEL_ENV || null,
    tip: blob
      ? 'Vercel Blob connected. Login and Publish to Cloud.'
      : storeId
        ? 'Using free shared store id from index.html (ALTAAR_CLOUD_STORE_ID).'
        : 'Login as admin and click Publish to Cloud. If a new store id is created, paste ALTAAR_CLOUD_STORE_ID into index.html and redeploy so all visitors see the same data.'
  });
};
