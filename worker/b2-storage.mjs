/**
 * Прокси хранилища Backblaze B2 — вариант для Cloudflare Workers.
 *
 * Зачем отдельная копия api/b2-storage.mjs: адреса Vercel (`*.vercel.app`)
 * недоступны из части сетей — DNS отдаёт диапазоны 64.29.17.0/24 и
 * 216.198.79.0/24, где соединение не устанавливается (проверено 17.10.2026,
 * успех 1 запрос из 20). Workers живут в сети Cloudflare и отвечают.
 *
 * Логика ровно та же, что у версии для Vercel:
 *   - проверка Firebase ID-токена (accounts:lookup) и роли в users/<uid>;
 *   - op=upload-url → presigned PUT, файл льёт браузер напрямую в B2,
 *     поэтому гигабайтный zip не проходит через прокси и не упирается
 *     в лимит тела запроса (100 МБ у Workers);
 *   - op=delete, op=list — админам;
 *   - GET ?path=… → 302 на presigned GET (ссылка живёт 15 минут).
 *
 * Секреты задаются через `wrangler secret put` (см. README), а не файлом:
 * ключи B2 не должны попадать в git. Публичный адрес прокси — либо из
 * `PUBLIC_BASE`, либо из origin запроса (см. publicBase()).
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ROLE_UPLOAD = ['admin', 'owner', 'beatmaker'];
const ROLE_ADMIN = ['admin', 'owner'];
const PATH_RE = /^(beats|tracks|projects)\/[a-z0-9][a-z0-9._-]{0,240}$/;
const PRESIGN_TTL_SECONDS = 6 * 60 * 60;
const GET_TTL_SECONDS = 900;
const MAX_LIST_PAGES = 10;

function s3(env) {
  return new S3Client({
    region: env.B2_REGION,
    endpoint: `https://s3.${env.B2_REGION}.backblazeb2.com`,
    credentials: { accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APP_KEY },
    forcePathStyle: true,
  });
}

/** Firebase ID-токен → { uid, email } или null. */
async function verifyAuth(idToken, env) {
  if (!idToken || !env.FIREBASE_API_KEY) return null;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const u = j && j.users && j.users[0];
  return u ? { uid: u.localId, email: u.email || '' } : null;
}

/** Роль пользователя из Firestore REST — тем же ID-токеном. */
async function getRole(uid, idToken, env) {
  if (!env.FIREBASE_PROJECT_ID) return null;
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}` +
      `/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
    { headers: { authorization: `Bearer ${idToken}` } }
  );
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const role = j && j.fields && j.fields.role && j.fields.role.stringValue;
  return typeof role === 'string' ? role : null;
}

/**
 * База постоянных ссылок на файлы.
 *
 * Берём PUBLIC_BASE, если он задан (прокси на своём домене). Иначе — origin
 * текущего запроса: на workers.dev это и есть адрес прокси.
 *
 * Абсолютный адрес здесь обязателен. Раньше при пустом PUBLIC_BASE отдавался
 * относительный `/api/b2-storage?path=…`, и он попадал в Firestore как ссылка
 * на файл. На сайте (GitHub Pages) такой путь ведёт в `vladlystsov.github.io`,
 * а в APK — в `https://localhost`: файлы переставали открываться сразу после
 * загрузки. Относительную ссылку отдавать нельзя.
 */
function publicBase(env, request) {
  const configured = (env.PUBLIC_BASE || '').trim().replace(/\/+$/, '');
  if (configured) return configured;

  const url = new URL(request.url);
  // Отбрасываем завершающие слэши и служебный /health: база должна указывать
  // на сам прокси, а не на конкретную операцию.
  const path = url.pathname.replace(/\/+$/, '').replace(/\/health$/, '');
  return `${url.origin}${path}`;
}

/** Постоянная ссылка на файл: <база>?path=… (не индексируется). */
function fileLink(env, path, request) {
  return `${publicBase(env, request)}?path=${encodeURIComponent(path)}`;
}

async function listAllObjects(client, env, bucket, request) {
  const items = [];
  let token;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1000,
        ContinuationToken: token,
      })
    );
    for (const o of res.Contents || []) {
      items.push({
        path: o.Key,
        name: String(o.Key || '').split('/').pop(),
        size: Number(o.Size) || 0,
        updated: o.LastModified ? new Date(o.LastModified).toISOString() : undefined,
        publicUrl: fileLink(env, o.Key, request),
      });
    }
    if (!res.IsTruncated || !res.NextContinuationToken) break;
    token = res.NextContinuationToken;
  }
  return items;
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  // authorization обязателен: клиент шлёт Firebase ID-токен
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, cache-control',
  'access-control-max-age': '86400',
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    // Служебная проверка: открывается ли прокси вообще. Без токена.
    // Путь сверяем «с хвостом», чтобы работало и в корне домена
    // Workers (…workers.dev/health), и за любым префиксом (/api/b2-storage/health).
    if (url.pathname.endsWith('/health') || url.pathname === '/healthz') {
      const missing = ['B2_KEY_ID', 'B2_APP_KEY', 'B2_BUCKET_NAME', 'B2_REGION'].filter((k) => !env[k]);
      return json(missing.length ? 500 : 200, {
        ok: missing.length === 0,
        missing,
        uid: env.B2_UID || null,
      });
    }

    const missing = ['B2_KEY_ID', 'B2_APP_KEY', 'B2_BUCKET_NAME', 'B2_REGION'].filter((k) => !env[k]);
    if (missing.length) {
      return json(500, { error: `Функция не настроена: нет env ${missing.join(', ')}` });
    }

    const client = s3(env);
    const bucket = env.B2_BUCKET_NAME;

    // Отдача файла: 302 на presigned GET (сама ссылка живёт 15 минут).
    if (request.method === 'GET') {
      const path = url.searchParams.get('path') || '';
      if (!PATH_RE.test(path)) return json(400, { error: 'Недопустимый путь файла' });
      const target = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: path }), {
        expiresIn: GET_TTL_SECONDS,
      });
      return new Response(null, {
        status: 302,
        headers: { ...CORS_HEADERS, location: target, 'cache-control': 'no-store' },
      });
    }

    if (request.method !== 'POST') return json(405, { error: 'Только POST' });

    if (!env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT_ID) {
      return json(500, { error: 'Функция не настроена: нет FIREBASE_API_KEY / FIREBASE_PROJECT_ID' });
    }

    const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = await verifyAuth(idToken, env);
    if (!user) return json(401, { error: 'Требуется вход в аккаунт' });

    const role = await getRole(user.uid, idToken, env);
    if (!role) return json(403, { error: 'Не удалось подтвердить роль (Firestore недоступен или профиль не найден)' });

    const body = await request.json().catch(() => ({}));
    const op = body && body.op;

    if (op === 'upload-url') {
      if (!ROLE_UPLOAD.includes(role)) return json(403, { error: 'Загрузка доступна админам и битмейкерам' });
      const path = typeof body.path === 'string' ? body.path : '';
      if (!PATH_RE.test(path)) return json(400, { error: 'Недопустимый путь файла' });
      const target = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: path }), {
        expiresIn: PRESIGN_TTL_SECONDS,
      });
      return json(200, { url: target, publicUrl: fileLink(env, path, request), method: 'PUT' });
    }

    if (op === 'delete') {
      if (!ROLE_ADMIN.includes(role)) return json(403, { error: 'Удаление доступно только админам' });
      const path = typeof body.path === 'string' ? body.path : '';
      if (!PATH_RE.test(path)) return json(400, { error: 'Недопустимый путь файла' });
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
      return json(200, { ok: true });
    }

    if (op === 'list') {
      if (!ROLE_ADMIN.includes(role)) return json(403, { error: 'Список файлов доступен только админам' });
      return json(200, { items: await listAllObjects(client, env, bucket, request) });
    }

    return json(400, { error: 'Неизвестная операция' });
  },
};