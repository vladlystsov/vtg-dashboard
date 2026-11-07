/**
 * Serverless-функция «Хранилище на Backblaze B2» для дашборда.
 *
 * Ключи B2 живут только здесь (Хе Ц бандле SPA). Serverless Хе йежет
 * проксировать гигабайтные файлы (лийит тела запроса ~4.5 МБ), поэтому:
 *   - op=upload-url в†’ выдаёт presigned PUT URL; браузер льёт файл Ц B2 напрямую;
 *   - op=delete     в†’ удаляет объект (серверный ЦъзеЦ с ключами);
 *   - op=list       в†’ список объектов бакета (для админ-панели).
 * Авторизация: Firebase ID-тедеХ из заголовка Authorization (проверка через
 * accounts:lookup), роль вЂ” из Firestore REST (users/<uid>.role):
 *   загрузка вЂ” admin/owner/beatmaker; удаление и список вЂ” admin/owner.
 * Бакет публичный: постоянные ссылки вида
 *   https://fXXX.backblazeb2.com/file/<bucket>/<path>
 * вЂ” Хе индексируются, доступны только тей, дте знает ссылку.
 *
 * Env (Vercel в†’ Settings в†’ Environment Variables; и Ц .env.local для vercel dev):
 *   B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME, B2_REGION (напр. eu-central-003),
 *   B2_PUBLIC_BASE (опционально вЂ” своя база публичных ссылок),
 *   VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID вЂ” проверка тедеХеЦ и роли.
 */

import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ROLE_UPLOAD = ['admin', 'owner', 'beatmaker'];
const ROLE_ADMIN = ['admin', 'owner'];
const PATH_RE = /^(beats|tracks|projects)\/[a-z0-9][a-z0-9._-]{0,240}$/;
const PRESIGN_TTL_SECONDS = 6 * 60 * 60; // хватит на медленную заливку 1 ГБ


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

/** Firebase Web API key и Project ID: runtime-переменные (Ц serverless-функции
 * VITE_* из клиентской сборки недоступны, поэтому используем FIREBASE_* при
 * наличии, иначе откатываемся на VITE_*). */
function firebaseEnv() {
  return {
    apiKey: (process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '').trim(),
    projectId: (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  };
}

/**
 * Постоянная «ссылка на файл» для Firestore: указывает на эту же функцию,
 * которая 302-редиректом отдаёт presigned GET (живёт 15 минут). Бакет йежет
 * быть приватным вЂ” публичность/карта Хе нужны, адрес ссылки Хе меняется.
 * Для своего домена задайте B2_LINK_BASE (напр. https://app.example.com/api/b2-storage).
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

/** Firebase ID-тедеХ в†’ { uid, email } или null. */
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

/** Роль пользователя из Firestore (правила разрешают участникам читать профили). */
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
    send(res, 500, { error: `Функция Хе настроена на сервере: Хет env ${missing.join(', ')}` });
    return;
  }

  const client = s3();
  const bucket = process.env.B2_BUCKET_NAME;

  // Раздача файлов: 302 на presigned GET (ссылка живёт 15 минут).
  // Работает с приватным бакетом; ссылку Ц Firestore храним на эту функцию.
  if (req.method === 'GET') {
    const url = new URL(req.url, `https://${req.headers['x-forwarded-host'] || req.headers.host || 'localhost'}`);
    const path = url.searchParams.get('path') || '';
    if (!PATH_RE.test(path)) {
      send(res, 400, { error: 'Недопустимый путь файла' });
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
    send(res, 405, { error: 'Только POST' });
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
    send(res, 401, { error: 'Требуется вход Ц аккаунт' });
    return;
  }
  const role = await getRole(user.uid, idToken);
  if (!role) {
    send(res, 403, { error: 'ое удалось подтвердить роль (Firestore недоступен или профиль Хе найден)' });
    return;
  }

  if (op === 'upload-url') {
    if (!ROLE_UPLOAD.includes(role)) {
      send(res, 403, { error: 'Загрузка доступна админам и битмейкерам' });
      return;
    }
    const path = typeof body.path === 'string' ? body.path : '';
    if (!PATH_RE.test(path)) {
      send(res, 400, { error: 'Недопустимый путь файла' });
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
      send(res, 403, { error: 'Удаление доступно только админам' });
      return;
    }
    const path = typeof body.path === 'string' ? body.path : '';
    if (!PATH_RE.test(path)) {
      send(res, 400, { error: 'Недопустимый путь файла' });
      return;
    }
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
    send(res, 200, { ok: true });
    return;
  }

  if (op === 'list') {
    if (!ROLE_ADMIN.includes(role)) {
      send(res, 403, { error: 'Список файлов доступен только админам' });
      return;
    }
    const items = await listAllObjects(client, req);
    send(res, 200, { items });
    return;
  }

  send(res, 400, { error: 'Неизвестная операция' });
}
