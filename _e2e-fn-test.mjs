// Временный e2e-тест serverless-функции api/soundcloud-profile.mjs
// (мок req/res + живой api-v2.soundcloud.com). Запуск: node _e2e-fn-test.mjs
import handler from './api/soundcloud-profile.mjs';

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(b) { this.body = b || ''; },
  };
}

async function call(url, method = 'GET') {
  const res = mockRes();
  await handler({ method, url }, res);
  return res;
}

const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
};

const PERMA = 'zhenya-11413880';

// 1. Happy path
let r = await call(`/api/soundcloud-profile?url=https%3A%2F%2Fsoundcloud.com%2F${PERMA}&limit=5`);
let j = r.body ? JSON.parse(r.body) : null;
assert(r.statusCode === 200, `happy path → 200 (got ${r.statusCode})`);
assert(r.headers['access-control-allow-origin'] === '*', 'заголовок CORS *');
assert(j && j.user && typeof j.user.id === 'number', `user.id числовой (${j && j.user && j.user.id})`);
assert(j && j.user && j.user.username === 'FLEXXXY', `username (${j && j.user && j.user.username})`);
assert(j && j.user && typeof j.user.trackCount === 'number', `user.trackCount (${j && j.user && j.user.trackCount})`);
assert(j && Array.isArray(j.items) && j.items.length === 5, `items.length = 5 (${j && j.items && j.items.length})`);
assert(
  j && j.items.every((t) => /^https:\/\/soundcloud\.com\/[^/]+\/[^/?#]+$/.test(t.url) && t.title && t.author),
  'все items: title/author/permalink-URL валидны'
);
assert(j && j.items.every((t) => typeof t.thumbnail === 'string' && t.thumbnail.includes('sndcdn.com')), 'обложки на месте');

// 2. Ссылка с разделом профиля …/tracks
r = await call(`/api/soundcloud-profile?url=https://soundcloud.com/${PERMA}/tracks&limit=3`);
j = r.body ? JSON.parse(r.body) : null;
assert(r.statusCode === 200 && j.items.length === 3, `ссылка …/tracks работает (${r.statusCode})`);

// 3. Ошибки входа
r = await call('/api/soundcloud-profile');
assert(r.statusCode === 400, `без url → 400 (${r.statusCode})`);
r = await call('/api/soundcloud-profile?url=https://on.soundcloud.com/abc123');
assert(r.statusCode === 400, `несуществующая короткая ссылка → 400 (${r.statusCode})`);
// 3а. Реальная короткая ссылка «Поделиться профилем» → раскрывается в профиль
r = await call('/api/soundcloud-profile?url=https://on.soundcloud.com/uBLHxrBcXfnTEBK0sf&limit=3');
j = r.body ? JSON.parse(r.body.replace(/^﻿/, '')) : null;
assert(
  r.statusCode === 200 && j && j.user && j.user.username === 'FLEXXXY',
  `короткая ссылка на профиль → 200 FLEXXXY (${r.statusCode})`
);
assert(j && Array.isArray(j.items) && j.items.length === 3, `короткая ссылка: items.length = 3 (${j && j.items && j.items.length})`);
r = await call('/api/soundcloud-profile?url=https://example.com/foo');
assert(r.statusCode === 400, `чужой хост → 400 (${r.statusCode})`);
r = await call('/api/soundcloud-profile?url=https://soundcloud.com/_no_such_user_xyz_1234567890');
assert(r.statusCode === 502 || r.statusCode === 404, `несуществующий профиль → 404/502 (${r.statusCode})`);

// 4. Кривой limit → дефолт 100 (в профиле 30 треков → вернёт все 30)
r = await call(`/api/soundcloud-profile?url=https%3A%2F%2Fsoundcloud.com%2F${PERMA}&limit=abc`);
j = r.body ? JSON.parse(r.body) : null;
assert(r.statusCode === 200 && j.items.length === 30, `limit=abc → дефолт, все ${j && j.items && j.items.length} треков`);

// 5. OPTIONS preflight
r = await call('/', 'OPTIONS');
assert(r.statusCode === 204, `OPTIONS → 204 (${r.statusCode})`);

console.log(process.exitCode ? 'E2E: ЕСТЬ ОШИБКИ' : 'E2E: всё ок');
