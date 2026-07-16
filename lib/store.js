/**
 * Shared data store for Altaar Admin API.
 *
 * Priority for SAVE/LOAD:
 *  1) Vercel Blob (if BLOB_READ_WRITE_TOKEN is set)
 *  2) JSONBlob.com free store (uses ALTAAR_CLOUD_STORE_ID from index.html)
 *  3) /tmp fallback (single-instance only, not multi-visitor safe)
 *
 * Admin password is defined ONLY in index.html:
 *   var ALTAAR_ADMIN_PASSWORD = 'your-password';
 *
 * Optional cloud store id in index.html (auto-created on first publish):
 *   var ALTAAR_CLOUD_STORE_ID = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
 */
const fs = require('fs');
const path = require('path');

const BLOB_PATHNAME = 'altaar-site-data.json';
const LOCAL_FILE = path.join(process.cwd(), 'data', 'store.json');
const TMP_FILE = path.join('/tmp', 'altaar-site-data.json');
const INDEX_HTML = path.join(process.cwd(), 'index.html');
const JSONBLOB_BASE = 'https://jsonblob.com/api/jsonBlob';

function emptySiteData() {
  return {
    version: 1,
    updatedAt: null,
    apartments: null,
    projects: null,
    galleryItems: null,
    newsItems: null,
    features: null,
    proximityItems: null,
    reviews: null,
    floorPlans: null,
    leads: null,
    siteSettings: null
  };
}

function readIndexHtml() {
  try {
    if (!fs.existsSync(INDEX_HTML)) return '';
    return fs.readFileSync(INDEX_HTML, 'utf8');
  } catch (e) {
    return '';
  }
}

function readConstFromIndex(name) {
  const html = readIndexHtml();
  if (!html) return '';
  const re = new RegExp(String(name) + "\\s*=\\s*['\\\"]([^'\\\"]*)['\\\"]");
  const m = html.match(re);
  return m && m[1] != null ? String(m[1]).trim() : '';
}

function getAdminPassword() {
  const fromEnv = String(
    process.env.ADMIN_PASSWORD || process.env.ALTAAR_ADMIN_PASSWORD || ''
  ).trim();
  if (fromEnv && process.env.FORCE_ENV_ADMIN_PASSWORD === '1') return fromEnv;

  const fromIndex = readConstFromIndex('ALTAAR_ADMIN_PASSWORD');
  if (fromIndex) return fromIndex;
  return 'altaar2026';
}

function getCloudStoreId(req) {
  // 1) header from admin client (after first publish)
  if (req) {
    const h = (req.headers['x-cloud-store-id'] || req.headers['x-altaar-store-id'] || '')
      .toString()
      .trim();
    if (h) return h;
  }
  // 2) index.html constant (shared with all visitors after redeploy)
  const fromIndex = readConstFromIndex('ALTAAR_CLOUD_STORE_ID');
  if (fromIndex && fromIndex.toLowerCase() !== 'auto' && fromIndex.length > 5) {
    return fromIndex;
  }
  // 3) env
  const fromEnv = String(process.env.ALTAAR_CLOUD_STORE_ID || '').trim();
  if (fromEnv) return fromEnv;
  return '';
}

function getBlobToken() {
  return String(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE || '').trim();
}

/* ---------------- Vercel Blob ---------------- */
async function readFromBlob() {
  const token = getBlobToken();
  if (!token) return null;
  try {
    const blob = await import('@vercel/blob');
    if (typeof blob.list !== 'function') return null;
    const result = await blob.list({ prefix: 'altaar', limit: 20, token });
    const file =
      (result.blobs || []).find((b) => (b.pathname || '').includes('altaar-site-data')) ||
      (result.blobs || [])[0];
    if (!file?.url) return null;
    const res = await fetch(file.url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Blob read error:', err.message);
    return null;
  }
}

async function writeToBlob(data) {
  const token = getBlobToken();
  if (!token) return { ok: false, error: 'no-blob-token' };
  const body = JSON.stringify(data);
  try {
    const blob = await import('@vercel/blob');
    if (typeof blob.put !== 'function') {
      return { ok: false, error: '@vercel/blob not installed' };
    }
    const attempts = [
      { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token },
      { access: 'public', contentType: 'application/json', addRandomSuffix: false, token },
      { access: 'public', token }
    ];
    for (const opts of attempts) {
      try {
        const result = await blob.put(BLOB_PATHNAME, body, opts);
        if (result?.url) return { ok: true, url: result.url, method: 'blob' };
      } catch (e) {
        console.error('Blob put failed:', e.message);
      }
    }
    return { ok: false, error: 'Blob put failed' };
  } catch (err) {
    return { ok: false, error: err.message || 'Blob write error' };
  }
}

/* ---------------- JSONBlob.com (free, no account) ---------------- */
async function readFromJsonBlob(storeId) {
  if (!storeId) return null;
  try {
    const res = await fetch(`${JSONBLOB_BASE}/${encodeURIComponent(storeId)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!res.ok) {
      console.error('JSONBlob read HTTP', res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('JSONBlob read error:', err.message);
    return null;
  }
}

function extractJsonBlobId(res) {
  // Location header: https://jsonblob.com/api/jsonBlob/<id>
  const loc = res.headers.get('location') || res.headers.get('Location') || '';
  const m = loc.match(/jsonBlob\/([^\/\s\?]+)/i);
  if (m) return m[1];
  // X-jsonblob header sometimes used
  const x = res.headers.get('x-jsonblob') || res.headers.get('X-Jsonblob') || '';
  if (x) return x.trim();
  return '';
}

async function writeToJsonBlob(data, storeId) {
  const body = JSON.stringify(data);
  try {
    if (storeId) {
      const res = await fetch(`${JSONBLOB_BASE}/${encodeURIComponent(storeId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body
      });
      if (res.ok || res.status === 200 || res.status === 201) {
        return { ok: true, storeId, method: 'jsonblob-put' };
      }
      // if missing, fall through to create
      console.error('JSONBlob PUT status', res.status);
    }

    // Create new blob
    const res = await fetch(JSONBLOB_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body
    });
    const newId = extractJsonBlobId(res);
    if ((res.ok || res.status === 201) && newId) {
      return { ok: true, storeId: newId, method: 'jsonblob-create', created: true };
    }
    const t = await res.text().catch(() => '');
    return {
      ok: false,
      error: `JSONBlob create failed HTTP ${res.status} ${t.slice(0, 120)}`
    };
  } catch (err) {
    return { ok: false, error: err.message || 'JSONBlob write error' };
  }
}

/* ---------------- local files ---------------- */
function readJsonFile(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

function writeJsonFile(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

async function getSiteData(req) {
  // 1) Vercel Blob
  const fromBlob = await readFromBlob();
  if (fromBlob) return { data: fromBlob, storage: 'blob' };

  // 2) JSONBlob shared free store
  const storeId = getCloudStoreId(req);
  if (storeId) {
    const fromJb = await readFromJsonBlob(storeId);
    if (fromJb) return { data: fromJb, storage: 'jsonblob', storeId };
  }

  // 3) tmp / local
  const fromTmp = readJsonFile(TMP_FILE);
  if (fromTmp) return { data: fromTmp, storage: 'tmp' };
  const fromDisk = readJsonFile(LOCAL_FILE);
  if (fromDisk) return { data: fromDisk, storage: 'local' };

  return { data: emptySiteData(), storage: 'empty', storeId: storeId || '' };
}

async function saveSiteData(data, req) {
  const payload = {
    ...emptySiteData(),
    ...data,
    version: 1,
    updatedAt: new Date().toISOString()
  };

  // Always try local mirrors
  writeJsonFile(TMP_FILE, payload);
  writeJsonFile(LOCAL_FILE, payload);

  // 1) Vercel Blob
  const blobResult = await writeToBlob(payload);
  if (blobResult.ok) {
    return {
      ...payload,
      storage: 'blob',
      blobUrl: blobResult.url || null,
      storeId: getCloudStoreId(req) || null
    };
  }

  // 2) JSONBlob free shared store (works without Vercel Blob setup)
  const existingId = getCloudStoreId(req);
  const jb = await writeToJsonBlob(payload, existingId || '');
  if (jb.ok) {
    return {
      ...payload,
      storage: 'jsonblob',
      storeId: jb.storeId,
      createdStoreId: !!jb.created
    };
  }

  // On Vercel, if both fail, hard error
  if (process.env.VERCEL) {
    const err = new Error(
      (jb && jb.error) ||
        (blobResult && blobResult.error) ||
        'Cloud save failed. Enable Vercel Blob OR use JSONBlob store id in index.html.'
    );
    err.code = 'NO_CLOUD';
    throw err;
  }

  // Local dev ok with tmp
  return { ...payload, storage: 'tmp', storeId: existingId || null };
}

function timingSafeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  let out = 0;
  for (let i = 0; i < x.length; i++) out |= x[i] ^ y[i];
  return out === 0;
}

function isAuthorized(req) {
  const expected = getAdminPassword();
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const xToken = (req.headers['x-admin-token'] || '').toString().trim();
  const token = bearer || xToken;
  return !!(token && expected && timingSafeEqual(token, expected));
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body != null) {
      if (typeof req.body === 'object') return resolve(req.body);
      if (typeof req.body === 'string') {
        try {
          return resolve(req.body ? JSON.parse(req.body) : {});
        } catch (e) {
          return reject(new Error('Invalid JSON body'));
        }
      }
    }
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 8_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = {
  emptySiteData,
  getSiteData,
  saveSiteData,
  getAdminPassword,
  getCloudStoreId,
  isAuthorized,
  json,
  readBody,
  getBlobToken
};
