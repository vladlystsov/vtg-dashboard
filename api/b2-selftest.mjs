/**
 * Самопроверка хранилища Backblaze B2: пишет маленький тестовый файл,
 * читает его обратно, проверяет, что он виден в списке, и удаляет.
 *
 * Нужна учётная запись B2 — она лежит в Vercel, а для локального запуска её
 * можно положить в `.env.local` (файл в .gitignore) или передать переменными
 * окружения:
 *
 *   B2_KEY_ID=... B2_APP_KEY=... B2_BUCKET_NAME=... B2_REGION=eu-central-003 npm run b2:test
 *
 * Что проверяем и зачем:
 *   - доступ на запись (writeFiles): без него не зальются mp3 и zip;
 *   - чтение по presigned-ссылке (как играет плеер);
 *   - список (listFiles): без него вкладка «Хранилище» пустая;
 *   - удаление (deleteFiles): без него не удалить архив из админки.
 *
 * Ключ должен иметь capabilities: listFiles, readFiles, writeFiles, deleteFiles.
 * Тестовый файл удаляется в конце; если что-то пошло не так и остался хвост —
 * он называется b2-selftest-<метка>.txt, его видно в списке и можно удалить руками.
 */
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFileSync, existsSync } from 'node:fs';

// .env.local — по желанию, без зависимостей: просто пары KEY=VALUE.
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const keyId = (process.env.B2_KEY_ID || '').trim();
const appKey = (process.env.B2_APP_KEY || '').trim();
const bucket = (process.env.B2_BUCKET_NAME || '').trim();
const region = (process.env.B2_REGION || '').trim();

const missing = [
  ['B2_KEY_ID', keyId],
  ['B2_APP_KEY', appKey],
  ['B2_BUCKET_NAME', bucket],
  ['B2_REGION', region],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error(`Не заданы переменные: ${missing.join(', ')}`);
  console.error('Скопируйте значения из Vercel → Settings → Environment Variables в .env.local');
  process.exit(2);
}

const s3 = new S3Client({
  region,
  endpoint: `https://s3.${region}.backblazeb2.com`,
  credentials: { accessKeyId: keyId, secretAccessKey: appKey },
  forcePathStyle: true,
});

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const path = `b2-selftest-${stamp}.txt`;
const payload = `VTG storage self-test\nвремя: ${new Date().toISOString()}\n`;

let failed = false;
const ok = (msg) => console.log(`OK   ${msg}`);
const bad = (msg) => {
  failed = true;
  console.error(`FAIL ${msg}`);
};

// 1. Запись
try {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: path, Body: payload }));
  ok(`запись ${path}`);
} catch (e) {
  bad(`запись недоступна: ${e?.name || ''} ${e?.message || e}`);
  console.error('     Если это AccessDenied — у ключа B2 нет capability writeFiles.');
  process.exit(1);
}

// 2. Чтение по presigned-ссылке (ровно так работает плеер)
try {
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: path }), { expiresIn: 300 });
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) bad(`чтение по ссылке: HTTP ${res.status}`);
  else if (text !== payload) bad('прочитанное содержимое не совпало с записанным');
  else ok('чтение по presigned-ссылке');
} catch (e) {
  bad(`чтение не удалось: ${e?.message || e}`);
}

// 3. Список (вкладка «Хранилище»)
try {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 }));
  const keys = (res.Contents || []).map((o) => o.Key);
  const total = (res.Contents || []).reduce((s, o) => s + Number(o.Size || 0), 0);
  if (keys.includes(path)) ok(`список: тестовый файл найден, всего файлов ${keys.length}, объём ${total} байт`);
  else bad('список не содержит только что записанный файл');
  if (!res.IsTruncated) ok('список прочитан целиком (пагинация не понадобилась)');
  else ok(`в бакете больше 1000 файлов — список вернул первую страницу, IsTruncated=${res.IsTruncated}`);
} catch (e) {
  bad(`список недоступен: ${e?.name || ''} ${e?.message || e}`);
  console.error('     Если это AccessDenied — у ключа B2 нет capability listFiles.');
}

// 4. Удаление
try {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
  const check = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: path, MaxKeys: 10 }));
  if ((check.Contents || []).length === 0) ok('удаление подтверждено, тестовый файл убран');
  else bad('после удаления файл всё ещё в списке');
} catch (e) {
  bad(`удаление недоступно: ${e?.name || ''} ${e?.message || e}`);
  console.error(`     Если это AccessDenied — у ключа B2 нет capability deleteFiles. Хвост: ${path}`);
}

console.log(failed ? '\nСамопроверка: есть проблемы' : '\nСамопроверка: всё работает (запись, чтение, список, удаление)');
process.exit(failed ? 1 : 0);