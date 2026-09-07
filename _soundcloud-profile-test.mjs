/**
 * Проверка серверной логики автоимпорта профиля SoundCloud.
 *
 * Запускается в Node и повторяет ровно то, что делает serverless-функция
 * api/soundcloud-profile.mjs:
 *   1) resolve: api-v2 /resolve превращает permalink профиля в объект пользователя;
 *   2) tracks:   api-v2 /users/{id}/tracks c публичным client_id и пагинацией
 *                по next_href (linked_partitioning);
 *   3) сбор { title, url, author, thumbnail }.
 *
 * Использование: node _soundcloud-profile-test.mjs [soundcloudUrl] [--verbose]
 */
const PROFILE_URL = process.argv[2] || 'https://soundcloud.com/zhenya-11413880/tracks';
const VERBOSE = process.argv.includes('--verbose');

// Публичный client_id SoundCloud (вшит во все страницы сайта, не секрет).
// Если SoundCloud его ротирует — обновить в api/soundcloud-profile.mjs.
const CLIENT_ID = 'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json, text/plain, */*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function resolveUser(profileUrl) {
  const u = new URL(profileUrl);
  // Оставляем только permalink пользователя: soundcloud.com/<handle> (без /tracks и т.п.)
  const handle = (u.pathname || '/').split('/').filter(Boolean)[0];
  const clean = `${u.protocol}//${u.host}/${handle}`;
  const j = await fetchJson(
    `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(clean)}&client_id=${CLIENT_ID}`
  );
  if (!j || typeof j.id !== 'number') throw new Error('resolve не вернул пользователя');
  return j;
}

async function collectTracks(userId) {
  const items = [];
  let next = `https://api-v2.soundcloud.com/users/${userId}/tracks?client_id=${CLIENT_ID}&limit=200&linked_partitioning=true`;
  let pages = 0;
  while (next && pages < 50) {
    const j = await fetchJson(next);
    pages++;
    if (VERBOSE) console.log(`  [page ${pages}] items in page: ${(j.collection || []).length}`);
    for (const t of j.collection || []) {
      if (!t || !t.permalink_url || t.kind !== 'track') continue;
      items.push({
        title: (t.title || '').trim(),
        url: t.permalink_url,
        author: t.user?.username || t.user?.permalink || 'SoundCloud',
        thumbnail: t.artwork_url || t.user?.avatar_url || undefined,
      });
    }
    next = j.next_href || null;
    if (next && !next.includes('client_id=')) {
      next += (next.includes('?') ? '&' : '?') + `client_id=${CLIENT_ID}`;
    }
  }
  return items;
}

async function main() {
  console.log(`Profile URL: ${PROFILE_URL}`);

  const user = await resolveUser(PROFILE_URL);
  console.log(`  user: ${user.username || user.permalink} (#${user.id}); track_count=${user.track_count}`);

  const tracks = await collectTracks(user.id);
  console.log(`Fetched ${tracks.length} tracks via api-v2.`);
  if (tracks.length === 0) {
    console.error('FAIL: api-v2 вернул пустой список.');
    process.exit(1);
  }
  for (const t of tracks.slice(0, 5)) console.log(`  - ${t.title}  | ${t.url}`);

  const allValid = tracks.every((t) => /^https:\/\/soundcloud\.com\//.test(t.url) && t.title && t.author);
  const uniq = new Set(tracks.map((t) => t.url)).size;
  console.log(`Validation: urls=${tracks.length} unique=${uniq} allValid=${allValid}`);
  if (!allValid || uniq !== tracks.length) {
    console.error('FAIL: валидация не прошла.');
    process.exit(1);
  }
  console.log('OK: логика serverless-функции подтверждена.');
}

main().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});