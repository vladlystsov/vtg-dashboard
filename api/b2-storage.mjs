/**
 * Serverless-С„СѓРЅРєС†РёСЏ В«РҐСЂР°РЅРёР»РёС‰Рµ РЅР° Backblaze B2В» РґР»СЏ РґР°С€Р±РѕСЂРґР°.
 *
 * РљР»СЋС‡Рё B2 Р¶РёРІСѓС‚ С‚РѕР»СЊРєРѕ Р·РґРµСЃСЊ (РЅРµ РІ Р±Р°РЅРґР»Рµ SPA). Serverless РЅРµ РјРѕР¶РµС‚
 * РїСЂРѕРєСЃРёСЂРѕРІР°С‚СЊ РіРёРіР°Р±Р°Р№С‚РЅС‹Рµ С„Р°Р№Р»С‹ (Р»РёРјРёС‚ С‚РµР»Р° Р·Р°РїСЂРѕСЃР° ~4.5 РњР‘), РїРѕСЌС‚РѕРјСѓ:
 *   - op=upload-url в†’ РІС‹РґР°С‘С‚ presigned PUT URL; Р±СЂР°СѓР·РµСЂ Р»СЊС‘С‚ С„Р°Р№Р» РІ B2 РЅР°РїСЂСЏРјСѓСЋ;
 *   - op=delete     в†’ СѓРґР°Р»СЏРµС‚ РѕР±СЉРµРєС‚ (СЃРµСЂРІРµСЂРЅС‹Р№ РІС‹Р·РѕРІ СЃ РєР»СЋС‡Р°РјРё);
 *   - op=list       в†’ СЃРїРёСЃРѕРє РѕР±СЉРµРєС‚РѕРІ Р±Р°РєРµС‚Р° (РґР»СЏ Р°РґРјРёРЅ-РїР°РЅРµР»Рё).
 * РђРІС‚РѕСЂРёР·Р°С†РёСЏ: Firebase ID-С‚РѕРєРµРЅ РёР· Р·Р°РіРѕР»РѕРІРєР° Authorization (РїСЂРѕРІРµСЂРєР° С‡РµСЂРµР·
 * accounts:lookup), СЂРѕР»СЊ вЂ” РёР· Firestore REST (users/<uid>.role):
 *   Р·Р°РіСЂСѓР·РєР° вЂ” admin/owner/beatmaker; СѓРґР°Р»РµРЅРёРµ Рё СЃРїРёСЃРѕРє вЂ” admin/owner.
 * Р‘Р°РєРµС‚ РїСѓР±Р»РёС‡РЅС‹Р№: РїРѕСЃС‚РѕСЏРЅРЅС‹Рµ СЃСЃС‹Р»РєРё РІРёРґР°
 *   https://fXXX.backblazeb2.com/file/<bucket>/<path>
 * вЂ” РЅРµ РёРЅРґРµРєСЃРёСЂСѓСЋС‚СЃСЏ, РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ С‚РµРј, РєС‚Рѕ Р·РЅР°РµС‚ СЃСЃС‹Р»РєСѓ.
 *
 * Env (Vercel в†’ Settings в†’ Environment Variables; Рё РІ .env.local РґР»СЏ vercel dev):
 *   B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME, B2_REGION (РЅР°РїСЂ. eu-central-003),
 *   B2_PUBLIC_BASE (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ вЂ” СЃРІРѕСЏ Р±Р°Р·Р° РїСѓР±Р»РёС‡РЅС‹С… СЃСЃС‹Р»РѕРє),
 *   VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID вЂ” РїСЂРѕРІРµСЂРєР° С‚РѕРєРµРЅРѕРІ Рё СЂРѕР»Рё.
 */

import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ROLE_UPLOAD = ['admin', 'owner', 'beatmaker'];
const ROLE_ADMIN = ['admin', 'owner'];
const PATH_RE = /^(beats|tracks|projects)\/[a-z0-9][a-z0-9._-]{0,240}$/;
const PRESIGN_TTL_SECONDS = 6 * 60 * 60; // С…РІР°С‚РёС‚ РЅР° РјРµРґР»РµРЅРЅСѓСЋ Р·Р°Р»РёРІРєСѓ 1 Р“Р‘


function cors(res) {
  // CORS для браузера. GET нужен не только для 302-редиректа player'а, но и для
  // кросс-доменного скачивания в кэш (fetch(url, {mode:'cors'}) из GitHub Pages).
  // PUT нужен для прямых загрузок файлов в B2 через presigned URL.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-bz-content-sha1, x-bz-file-name, x-bz-upload-timestamp, cache-control');
  res.setHeader('Access-Control-Expose-Headers', 'x-bz-content-sha1, x-bz-file-name, x-bz-upload-timestamp');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, status, payload) {
  // Гарантируем, что CORS-заголовки всегда установлены в ответе
  cors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function s3() {
  const region = (process.env.B2_REGION || '').trim();
  return new S3Client({
    region,
    endpoint: `https://s3.${region}.backblazeb2.com`,
    credentials: {
      accessKeyId: process.env.B2_KEY_ID,
      secretAccessKey: process.env.B2_APP_KEY,
    },
    forcePathStyle: true,
  });
}

/** Firebase Web API key Рё Project ID: runtime-РїРµСЂРµРјРµРЅРЅС‹Рµ (РІ serverless-С„СѓРЅРєС†РёРё
 * VITE_* РёР· РєР»РёРµРЅС‚СЃРєРѕР№ СЃР±РѕСЂРєРё РЅРµРґРѕСЃС‚СѓРїРЅС‹, РїРѕСЌС‚РѕРјСѓ РёСЃРїРѕР»СЊР·СѓРµРј FIREBASE_* РїСЂРё
 * РЅР°Р»РёС‡РёРё, РёРЅР°С‡Рµ РѕС‚РєР°С‚С‹РІР°РµРјСЃСЏ РЅР° VITE_*). */
function firebaseEnv() {
  return {
    apiKey: (process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '').trim(),
    projectId: (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  };
}

/**
 * РџРѕСЃС‚РѕСЏРЅРЅР°СЏ В«СЃСЃС‹Р»РєР° РЅР° С„Р°Р№Р»В» РґР»СЏ Firestore: СѓРєР°Р·С‹РІР°РµС‚ РЅР° СЌС‚Сѓ Р¶Рµ С„СѓРЅРєС†РёСЋ,
 * РєРѕС‚РѕСЂР°СЏ 302-СЂРµРґРёСЂРµРєС‚РѕРј РѕС‚РґР°С‘С‚ presigned GET (Р¶РёРІС‘С‚ 15 РјРёРЅСѓС‚). Р‘Р°РєРµС‚ РјРѕР¶РµС‚
 * Р±С‹С‚СЊ РїСЂРёРІР°С‚РЅС‹Рј вЂ” РїСѓР±Р»РёС‡РЅРѕСЃС‚СЊ/РєР°СЂС‚Р° РЅРµ РЅСѓР¶РЅС‹, Р°РґСЂРµСЃ СЃСЃС‹Р»РєРё РЅРµ РјРµРЅСЏРµС‚СЃСЏ.
 * Р”Р»СЏ СЃРІРѕРµРіРѕ РґРѕРјРµРЅР° Р·Р°РґР°Р№С‚Рµ B2_LINK_BASE (РЅР°РїСЂ. https://app.example.com/api/b2-storage).
 */
function fileLink(req, path) {
  const base = (process.env.B2_LINK_BASE || '').trim().replace(/\/+$/, '');
  const q = `?path=${encodeURIComponent(path)}`;
  if (base) return `${base}${q}`;
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}/api/b2-storage${q}`;
}

async function readJson(req) {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return null;
  }
}

/** Firebase ID-С‚РѕРєРµРЅ в†’ { uid, email } РёР»Рё null. */
async function verifyAuth(idToken) {
  const { apiKey } = firebaseEnv();
  if (!idToken || !apiKey) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const u = j && j.users && j.users[0];
  return u ? { uid: u.localId, email: u.email || '' } : null;
}

/** Р РѕР»СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР· Firestore (РїСЂР°РІРёР»Р° СЂР°Р·СЂРµС€Р°СЋС‚ СѓС‡Р°СЃС‚РЅРёРєР°Рј С‡РёС‚Р°С‚СЊ РїСЂРѕС„РёР»Рё). */
async function getRole(uid, idToken) {
  const { projectId } = firebaseEnv();
  if (!projectId) return null;
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { authorization: `Bearer ${idToken}` } }
    );
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const role = j && j.fields && j.fields.role && j.fields.role.stringValue;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

// === OPS ===

async function listAllObjects(client, req) {
  const items = [];
  let token;
  for (let page = 0; page < 10; page++) {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: process.env.B2_BUCKET_NAME, MaxKeys: 1000, ContinuationToken: token })
    );
    for (const o of res.Contents || []) {
      items.push({
        path: o.Key,
        name: String(o.Key || '').split('/').pop(),
        size: Number(o.Size) || 0,
        updated: o.LastModified ? new Date(o.LastModified).toISOString() : undefined,
        publicUrl: fileLink(req, o.Key),
      });
    }
    if (!res.IsTruncated || !res.NextContinuationToken) break;
    token = res.NextContinuationToken;
  }
  return items;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

const missing = ['B2_KEY_ID', 'B2_APP_KEY', 'B2_BUCKET_NAME', 'B2_REGION'].filter(
    (k) => !process.env[k]
  );
  if (missing.length) {
    send(res, 500, { error: `Р¤СѓРЅРєС†РёСЏ РЅРµ РЅР°СЃС‚СЂРѕРµРЅР° РЅР° СЃРµСЂРІРµСЂРµ: РЅРµС‚ env ${missing.join(', ')}` });
    return;
  }

  const client = s3();
  const bucket = process.env.B2_BUCKET_NAME;

  // Р Р°Р·РґР°С‡Р° С„Р°Р№Р»РѕРІ: 302 РЅР° presigned GET (СЃСЃС‹Р»РєР° Р¶РёРІС‘С‚ 15 РјРёРЅСѓС‚).
  // Р Р°Р±РѕС‚Р°РµС‚ СЃ РїСЂРёРІР°С‚РЅС‹Рј Р±Р°РєРµС‚РѕРј; СЃСЃС‹Р»РєСѓ РІ Firestore С…СЂР°РЅРёРј РЅР° СЌС‚Сѓ С„СѓРЅРєС†РёСЋ.
  if (req.method === 'GET') {
    const url = new URL(req.url, `https://${req.headers['x-forwarded-host'] || req.headers.host || 'localhost'}`);
    const path = url.searchParams.get('path') || '';
    if (!PATH_RE.test(path)) {
      send(res, 400, { error: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ РїСѓС‚СЊ С„Р°Р№Р»Р°' });
      return;
    }
    const target = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: path }), { expiresIn: 900 });
    res.statusCode = 302;
    res.setHeader('Location', target);
    res.setHeader('Cache-Control', 'no-store');
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, { error: 'РўРѕР»СЊРєРѕ POST' });
    return;
  }
// Для POST (загрузка/удаление/список) нужен Firebase API key и Project ID.
  if (!firebaseEnv().apiKey || !firebaseEnv().projectId) {
    send(res, 500, { error: 'Функция не настроена на сервере: нет FIREBASE_API_KEY / FIREBASE_PROJECT_ID' });
    return;
  }

  const body = await readJson(req);
  const op = body && body.op;

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = await verifyAuth(idToken);
  if (!user) {
    send(res, 401, { error: 'РўСЂРµР±СѓРµС‚СЃСЏ РІС…РѕРґ РІ Р°РєРєР°СѓРЅС‚' });
    return;
  }
  const role = await getRole(user.uid, idToken);
  if (!role) {
    send(res, 403, { error: 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґС‚РІРµСЂРґРёС‚СЊ СЂРѕР»СЊ (Firestore РЅРµРґРѕСЃС‚СѓРїРµРЅ РёР»Рё РїСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ)' });
    return;
  }

  if (op === 'upload-url') {
    if (!ROLE_UPLOAD.includes(role)) {
      send(res, 403, { error: 'Р—Р°РіСЂСѓР·РєР° РґРѕСЃС‚СѓРїРЅР° Р°РґРјРёРЅР°Рј Рё Р±РёС‚РјРµР№РєРµСЂР°Рј' });
      return;
    }
    const path = typeof body.path === 'string' ? body.path : '';
    if (!PATH_RE.test(path)) {
      send(res, 400, { error: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ РїСѓС‚СЊ С„Р°Р№Р»Р°' });
      return;
    }
    const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: path }), {
      expiresIn: PRESIGN_TTL_SECONDS,
    });
    send(res, 200, { url, publicUrl: fileLink(req, path), method: 'PUT' });
    return;
  }

  if (op === 'delete') {
    if (!ROLE_ADMIN.includes(role)) {
      send(res, 403, { error: 'РЈРґР°Р»РµРЅРёРµ РґРѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅР°Рј' });
      return;
    }
    const path = typeof body.path === 'string' ? body.path : '';
    if (!PATH_RE.test(path)) {
      send(res, 400, { error: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ РїСѓС‚СЊ С„Р°Р№Р»Р°' });
      return;
    }
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
    send(res, 200, { ok: true });
    return;
  }

  if (op === 'list') {
    if (!ROLE_ADMIN.includes(role)) {
      send(res, 403, { error: 'РЎРїРёСЃРѕРє С„Р°Р№Р»РѕРІ РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅР°Рј' });
      return;
    }
    const items = await listAllObjects(client, req);
    send(res, 200, { items });
    return;
  }

  send(res, 400, { error: 'РќРµРёР·РІРµСЃС‚РЅР°СЏ РѕРїРµСЂР°С†РёСЏ' });
}
