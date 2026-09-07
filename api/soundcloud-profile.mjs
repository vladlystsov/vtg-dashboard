/**
 * Serverless-функция автоимпорта профиля SoundCloud (для Vercel).
 *
 * Зачем нужен прокси: HTML-страницы и oEmbed soundcloud.com из Node/браузера
 * без «настоящего» браузерного окружения блокируются антиботом (DataDome 202),
 * а api-v2.soundcloud.com не отдаёт CORS-заголовки чужим origin (проверено:
 * `Vary: Origin`, ACAO=null). При этом сам api-v2 (тот же, что использует сайт
 * soundcloud.com) отвечает на серверные запросы при передаче публичного
 * client_id. Функция:
 *
 *   1) resolve-ит ссылку профиля → объект пользователя (числовой id);
 *   2) постранично выкачивает api-v2/users/{id}/tracks (linked_partitioning);
 *   3) отдаёт нормализованный JSON-список треков с CORS `*`.
 *
 * Секретов нет: client_id публичный (сайт SoundCloud шлёт его в открытом виде).
 * Переопределяется переменной окружения SC_CLIENT_ID.
 * Документация: SOUNDCLOUD_API.md. Тест: node _soundcloud-profile-test.mjs
 */

const DEFAULT_CLIENT_ID = 'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo';
const API_V2 = 'https://api-v2.soundcloud.com';
const PAGE_SIZE = 200; // максимум SoundCloud
const MAX_PAGES = 25; // страховка от циклов в next_href
const DEFAULT_LIMIT = 100; // сколько треков отдаём за один вызов (UX импорта)
const MAX_LIMIT = 500;
const FETCH_TIMEOUT_MS = 8000;

const CLIENT_ID = (process.env.SC_CLIENT_ID || '').trim() || DEFAULT_CLIENT_ID;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        // api-v2 отвечает и без UA, но часть краёв DataDome требует «браузерный».
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        accept: 'application/json',
      },
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = '';
      try {
        const j = JSON.parse(text);
        detail = String((j && j.error && j.error.message) || (j && j.message) || '');
      } catch {
        // не JSON — оставляем detail пустым
      }
      throw new Error(`SoundCloud вернул HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Из произвольной ссылки на soundcloud.com извлекает пермалинк пользователя
 * (первый сегмент пути: …/<user>[/tracks|/likes|…]). null — если это не
 * ссылка на профиль (короткие ссылки, другой хост, пустой путь).
 */
function extractProfilePermalink(rawUrl) {
  let u = String(rawUrl || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return null;
  }
  const h = parsed.hostname.toLowerCase();
  if (h !== 'soundcloud.com' && !h.endsWith('.soundcloud.com')) return null;
  if (h === 'on.soundcloud.com') return null; // короткие ссылки ведут на трек
  const segs = parsed.pathname.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  return segs[0];
}
/** Короткие домены SoundCloud для «Поделиться» (ведут и на треки, и на профили). */
const SHORT_SC_HOSTS = new Set(['on.soundcloud.com', 'snd.sc']);

/** Разделы страницы профиля (второй сегмент пути после пермалинка пользователя). */
const SC_PROFILE_SECTIONS =
  /^(tracks|likes|reposts|comments|followers|followings|sets|podcasts|albums|spotlights)$/i;

function isShortScUrl(rawUrl) {
  let u = String(rawUrl || '').trim();
  if (!u) return false;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  try {
    return SHORT_SC_HOSTS.has(new URL(u).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Раскрывает короткую ссылку (on.soundcloud.com/…, snd.sc/…) в полный URL,
 * следуя за редиректами и не скачивая тело ответа. null — раскрыть не удалось.
 * Из браузера цель редиректа не видна (opaque-ответ), поэтому делаем это здесь.
 */
async function followShortLink(shortUrl, maxHops = 3) {
  let current = shortUrl;
  for (let hop = 0; hop < maxHops; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          accept: 'text/html',
        },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
    const loc = res.headers.get('location');
    if (!/^3\d\d$/.test(String(res.status)) || !loc) return null;
    let next;
    try {
      next = new URL(loc, current).toString();
    } catch {
      return null;
    }
    const h = new URL(next).hostname.toLowerCase();
    if (h.endsWith('soundcloud.com') && !SHORT_SC_HOSTS.has(h)) return next;
    current = next;
  }
  return null;
}

/** По полному URL: ведёт ли он на трек/плейлист, а не на страницу профиля. */
function looksLikeTrackOrPlaylistUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h !== 'soundcloud.com' && !h.endsWith('.soundcloud.com')) return false;
    const segs = u.pathname.split('/').filter(Boolean);
    return segs.length >= 2 && !SC_PROFILE_SECTIONS.test(segs[1]);
  } catch {
    return false;
  }
}

function artworkFor(track, user) {
  const a =
    (typeof track.artwork_url === 'string' && track.artwork_url) ||
    (user && typeof user.avatar_url === 'string' && user.avatar_url) ||
    '';
  if (!a) return null;
  // Поднимаем качество обложки: -large (100x100) → -t500x500, как в oEmbed.
  return a.replace(/-(?:large|t\d+x\d+)\.([a-z0-9]+)$/i, '-t500x500.$1');
}

function mapTrack(track, user) {
  if (!track || track.kind !== 'track') return null;
  const title = typeof track.title === 'string' ? track.title.trim() : '';
  const url = typeof track.permalink_url === 'string' ? track.permalink_url.trim() : '';
  if (!title || !/^https:\/\/soundcloud\.com\//i.test(url)) return null;
  return {
    title,
    url,
    author: (track.user && track.user.username) || (user && user.username) || 'SoundCloud',
    thumbnail: artworkFor(track, user) || undefined,
  };
}

export default async function handler(req, res) {
  // CORS: SPA может лежать на любом origin (GitHub Pages → Vercel-функция).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    send(res, 405, { error: 'Метод не поддерживается (нужен GET).' });
    return;
  }

  let q;
  try {
    q = new URL(req.url || '/', 'https://internal.invalid').searchParams;
  } catch {
    send(res, 400, { error: 'Некорректный запрос.' });
    return;
  }

  let permalink = extractProfilePermalink(q.get('url') || '');
  if (!permalink) {
    // Короткой ссылкой (on.soundcloud.com/…) делятся и профилями тоже —
    // раскрываем редирект серверно: из браузера цель редиректа не видна.
    const raw = String(q.get('url') || '').trim();
    if (isShortScUrl(raw)) {
      const target = await followShortLink(
        /^https?:\/\//i.test(raw) ? raw : 'https://' + raw.replace(/^\/+/, '')
      );
      if (target) {
        if (looksLikeTrackOrPlaylistUrl(target)) {
          send(res, 400, {
            error:
              'Короткая ссылка ведёт на трек/плейлист, а не на профиль. Вставьте полную ссылку на трек (https://soundcloud.com/…) — он импортируется как отдельный трек, или ссылку на профиль вида https://soundcloud.com/<пермалинк>.',
          });
          return;
        }
        permalink = extractProfilePermalink(target);
      }
    }
  }
  if (!permalink) {
    send(res, 400, {
      error:
        'Ожидается ссылка на профиль вида https://soundcloud.com/<пермалинк> (короткие ссылки on.soundcloud.com/… тоже поддерживаются).',
    });
    return;
  }

  let limit = parseInt(q.get('limit') || '', 10);
  if (!Number.isFinite(limit)) limit = DEFAULT_LIMIT;
  limit = Math.max(1, Math.min(MAX_LIMIT, limit));

  try {
    // 1. Профиль → пользователь (числовой id нужен для /users/{id}/tracks).
    const user = await fetchJson(
      `${API_V2}/resolve?url=${encodeURIComponent(
        `https://soundcloud.com/${encodeURIComponent(permalink)}`
      )}&client_id=${encodeURIComponent(CLIENT_ID)}`
    );
    if (!user || typeof user.id === 'undefined') {
      send(res, 404, { error: 'SoundCloud не распознал профиль по этой ссылке.' });
      return;
    }
    if (user.kind && user.kind !== 'user') {
      send(res, 400, {
        error:
          user.kind === 'track'
            ? 'Это ссылка на трек, а не на профиль — импортируйте её как отдельный трек.'
            : `Ссылка ведёт на объект типа «${user.kind}», а не на профиль.`,
      });
      return;
    }

    // 2. Треки профиля, постранично (linked_partitioning → collection + next_href).
    const items = [];
    let nextUrl =
      `${API_V2}/users/${encodeURIComponent(String(user.id))}/tracks` +
      `?client_id=${encodeURIComponent(CLIENT_ID)}&limit=${PAGE_SIZE}&linked_partitioning=true`;

    for (let page = 0; nextUrl && items.length < limit && page < MAX_PAGES; page++) {
      const data = await fetchJson(nextUrl);
      const collection = Array.isArray(data && data.collection) ? data.collection : [];
      if (collection.length === 0) break;
      for (const t of collection) {
        if (items.length >= limit) break;
        const item = mapTrack(t, user);
        if (item) items.push(item);
      }
      let nh = (data && data.next_href) || '';
      if (nh) {
        try {
          const nu = new URL(nh);
          if (!nu.searchParams.has('client_id')) nu.searchParams.set('client_id', CLIENT_ID);
          nh = nu.toString();
        } catch {
          nh = '';
        }
      }
      nextUrl = nh;
    }

    send(res, 200, {
      user: {
        id: user.id,
        username: user.username || permalink,
        permalink: user.permalink_url || `https://soundcloud.com/${permalink}`,
        trackCount: typeof user.track_count === 'number' ? user.track_count : items.length,
      },
      total: items.length,
      items,
    });
  } catch (e) {
    send(res, 502, { error: (e && e.message) || 'Ошибка запроса к SoundCloud.' });
  }
}