// Разовое локальное тестирование логики воркера без сети и ключей.
// Мокаем fetch (identitytoolkit, Firestore, B2) и проверяем ветки обработки.
import handler from './worker/b2-storage.mjs';

let passed = 0;
const assert = (cond, msg) => {
  if (cond) { passed++; console.log('OK  ', msg); }
  else { console.error('FAIL', msg); process.exitCode = 1; }
};

const ENV = {
  B2_KEY_ID: 'k', B2_APP_KEY: 's', B2_BUCKET_NAME: 'vtg-storage',
  B2_REGION: 'eu-central-003', FIREBASE_API_KEY: 'api', FIREBASE_PROJECT_ID: 'proj',
  PUBLIC_BASE: '',
};

// Подменяем сеть: presigner считает подпись локально и сеть не трогает,
// поэтому перехватываем только вызовы к Firebase.
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit')) {
    const token = JSON.parse(opts.body || '{}').idToken;
    if (token === 'good') return new Response(JSON.stringify({ users: [{ localId: 'uid1', email: 'a@b' }] }), { status: 200 });
    return new Response('{}', { status: 400 });
  }
  if (u.includes('firestore.googleapis.com')) {
    return new Response(JSON.stringify({ fields: { role: { stringValue: 'owner' } } }), { status: 200 });
  }
  throw new Error('неожиданный сетевой вызов: ' + u);
};

const call = (init) => handler.fetch(new Request('https://proxy.test/api/b2-storage' + (init.q || ''), init), ENV);

// 1. Без токена → 401
let r = await call({ method: 'POST', body: JSON.stringify({ op: 'list' }) });
assert(r.status === 401, 'без токена → 401');

// 2. Плохой токен → 401
r = await call({ method: 'POST', headers: { authorization: 'Bearer bad' }, body: JSON.stringify({ op: 'list' }) });
assert(r.status === 401, 'плохой токен → 401');

// 3. CORS-заголовки на месте и authorization разрешён (иначе браузер заблокирует)
const h = Object.fromEntries(r.headers.entries());
assert(h['access-control-allow-origin'] === '*', 'Access-Control-Allow-Origin: *');
assert((h['access-control-allow-headers'] || '').includes('authorization'), 'authorization в Allow-Headers');

// 4. OPTIONS → 204 без тела
r = await call({ method: 'OPTIONS' });
assert(r.status === 204, 'OPTIONS → 204');

// 5. /health отвечает и показывает наличие секретов
r = await call({ method: 'GET', q: '/health' });
let j = await r.json();
assert(r.status === 200 && j.ok === true, '/health → 200, секреты на месте');

r = await handler.fetch(new Request('https://proxy.test/health'), { ...ENV, B2_APP_KEY: '' });
j = await r.json();
assert(r.status === 500 && j.missing.includes('B2_APP_KEY'), '/health ловит отсутствующий секрет');

// 6. GET без пути → 400, с кривым путём → 400 (обращение к B2 не должно произойти)
r = await call({ method: 'GET' });
assert(r.status === 400, 'GET без path → 400');
r = await call({ method: 'GET', q: '?path=../../etc/passwd' });
assert(r.status === 400, 'GET с путём вне правил → 400');

// 7. upload-url с хорошим токеном → presigned-ссылка (сеть не нужна)
r = await call({
  method: 'POST',
  headers: { authorization: 'Bearer good' },
  body: JSON.stringify({ op: 'upload-url', path: 'tracks/test-a.mp3' }),
});
j = await r.json();
assert(r.status === 200 && typeof j.url === 'string' && j.url.includes('X-Amz-Signature'), 'upload-url → presigned PUT');
assert(typeof j.publicUrl === 'string' && j.publicUrl.includes('path='), 'publicUrl ведёт через функцию');

// 8. Некорректный путь в upload-url → 400
r = await call({
  method: 'POST',
  headers: { authorization: 'Bearer good' },
  body: JSON.stringify({ op: 'upload-url', path: 'secrets/keys.txt' }),
});
assert(r.status === 400, 'upload-url с чужой папкой → 400');

// 9. Неизвестная операция → 400
r = await call({
  method: 'POST',
  headers: { authorization: 'Bearer good' },
  body: JSON.stringify({ op: 'что-то' }),
});
assert(r.status === 400, 'неизвестная операция → 400');

console.log(process.exitCode ? 'ЕСТЬ ОШИБКИ' : `Все проверки пройдены: ${passed}`);