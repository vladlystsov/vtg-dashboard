/**
 * ������ ��������� Backblaze B2 — ������� ��� Cloudflare Workers.
 *
 * ����� ��������� ����� api/b2-storage.mjs: ������ Vercel (`*.vercel.app`)
 * ���������� �� ����� ����� — DNS ����� ��������� 64.29.17.0/24 и
 * 216.198.79.0/24, ��� ���������� �� ��������������� (��������� 17.10.2026,
 * ����� 1 ������ �� 20). Workers ����� в ���� Cloudflare и ��������.
 *
 * ������ ����� �� ��, ��� у ������ ��� Vercel:
 *   - �������� Firebase ID-������ (accounts:lookup) и ���� в users/<uid>;
 *   - op=upload-url → presigned PUT, ���� ���� ������� �������� в B2,
 *     ������� ����������� zip �� �������� ����� ������ и �� ���������
 *     в ����� ���� ������� (100 �� у Workers);
 *   - op=delete, op=list — �������;
 *   - GET ?path=… → 302 �� presigned GET (������ ���� 15 �����).
 *
 * ������� �������� ����� `wrangler secret put` (��. README), а �� ������:
 * ����� B2 �� ������ �������� в git. ��������� ����� ������ — ���� ��
 * `PUBLIC_BASE`, ���� �� origin ������� (��. publicBase()).
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { installDom } from './vendor/minidom.mjs';

installDom();

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

/** Firebase ID-����� → { uid, email } ��� null. */
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

/** ���� ������������ �� Firestore REST — ��� �� ID-�������. */
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
 * ���� ���������� ������ �� �����.
 *
 * ���� PUBLIC_BASE, ���� �� ����� (������ �� ���� ������). ����� — origin
 * �������� �������: �� workers.dev ��� и ���� ����� ������.
 *
 * ���������� ����� ����� ����������. ������ ��� ������ PUBLIC_BASE ���������
 * ������������� `/api/b2-storage?path=…`, и �� ������� в Firestore ��� ������
 * �� ����. �� ����� (GitHub Pages) ����� ���� ���� в `vladlystsov.github.io`,
 * а в APK — в `https://localhost`: ����� ����������� ����������� ����� �����
 * ��������. ������������� ������ �������� ������.
 */
function publicBase(env, request) {
  const configured = (env.PUBLIC_BASE || '').trim().replace(/\/+$/, '');
  if (configured) return configured;

  const url = new URL(request.url);
  // ����������� ����������� ����� и ��������� /health: ���� ������ ���������
  // �� ��� ������, а �� �� ���������� ��������.
  const path = url.pathname.replace(/\/+$/, '').replace(/\/health$/, '');
  return `${url.origin}${path}`;
}

/** ���������� ������ �� ����: <����>?path=… (�� �������������). */
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
  // authorization ����������: ������ ��� Firebase ID-�����
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

    // ��������� ��������: ����������� �� ������ ������. ��� ������.
    // ���� ������� �� �������, ����� �������� и в ����� ������
    // Workers (…workers.dev/health), и �� ����� ��������� (/api/b2-storage/health).
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
      return json(500, { error: `������� �� ���������: ��� env ${missing.join(', ')}` });
    }

    const client = s3(env);
    const bucket = env.B2_BUCKET_NAME;

    // ������ �����: 302 �� presigned GET (���� ������ ���� 15 �����).
    if (request.method === 'GET') {
      const path = url.searchParams.get('path') || '';
      if (!PATH_RE.test(path)) return json(400, { error: '������������ ���� �����' });
      const target = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: path }), {
        expiresIn: GET_TTL_SECONDS,
      });
      return new Response(null, {
        status: 302,
        headers: { ...CORS_HEADERS, location: target, 'cache-control': 'no-store' },
      });
    }

    if (request.method !== 'POST') return json(405, { error: '������ POST' });

    if (!env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT_ID) {
      return json(500, { error: '������� �� ���������: ��� FIREBASE_API_KEY / FIREBASE_PROJECT_ID' });
    }

    const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = await verifyAuth(idToken, env);
    if (!user) return json(401, { error: '��������� ���� в �������' });

    const role = await getRole(user.uid, idToken, env);
    if (!role) return json(403, { error: '�� ������� ����������� ���� (Firestore ���������� ��� ������� �� ������)' });

    const body = await request.json().catch(() => ({}));
    const op = body && body.op;

    if (op === 'upload-url') {
      if (!ROLE_UPLOAD.includes(role)) return json(403, { error: '�������� �������� ������� и �����������' });
      const path = typeof body.path === 'string' ? body.path : '';
      if (!PATH_RE.test(path)) return json(400, { error: '������������ ���� �����' });
      const target = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: path }), {
        expiresIn: PRESIGN_TTL_SECONDS,
      });
      return json(200, { url: target, publicUrl: fileLink(env, path, request), method: 'PUT' });
    }

    if (op === 'delete') {
      if (!ROLE_ADMIN.includes(role)) return json(403, { error: '�������� �������� ������ �������' });
      const path = typeof body.path === 'string' ? body.path : '';
      if (!PATH_RE.test(path)) return json(400, { error: '������������ ���� �����' });
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
      return json(200, { ok: true });
    }

    if (op === 'list') {
      if (!ROLE_ADMIN.includes(role)) return json(403, { error: '������ ������ �������� ������ �������' });
      try {
        const items = await listAllObjects(client, env, bucket, request);
        return json(200, { items });
      } catch (e) {
        return json(500, { error: `list error: ${e && e.message ? e.message : String(e)}` });
      }
    }

    return json(400, { error: '����������� ��������' });
  },
};