/**
 * Serverless-функция импорта канала YouTube / YouTube Music (для Vercel).
 *
 * Зачем нужен прокси: RSS-лента youtube.com/feeds/videos.xml не отдаёт
 * CORS-заголовки браузеру, а публичные CORS-прокси (api.allorigins.win и т.п.)
 * нестабильны (522 от Cloudflare). Резолв @handle тоже требует чтения HTML
 * страницы youtube.com, заблокированной CORS. Функция серверно:
 *
 *   1) по параметру url (любая ссылка канала: /channel/UC…, /@handle, /c/имя,
 *      /user/имя — включая music.youtube.com) определяет channel ID
 *      (UC… извлекается из ссылки; для handle/user — чтение HTML страницы);
 *   2) читает RSS-ленту youtube.com/feeds/videos.xml?channel_id=…;
 *   3) отдаёт нормализованный JSON-список видео с CORS `*`.
 *
 * Секретов нет. Тест: node _yt-music-check.mjs
 */

const FETCH_TIMEOUT_MS = 12000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'text/html,application/xml,text/xml,*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Из произвольной ссылки YouTube извлекает ключ канала или null. */
function extractChannelKey(rawUrl) {
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
  if (!h.endsWith('youtube.com') && h !== 'youtu.be') return null;
  const segs = parsed.pathname.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  if (segs[0] === 'channel' && segs[1]) return { kind: 'id', value: segs[1] };
  if (segs[0] === 'c' && segs[1]) return { kind: 'custom', value: segs[1] };
  if (segs[0] === 'user' && segs[1]) return { kind: 'user', value: segs[1] };
  if (segs[0].startsWith('@')) return { kind: 'handle', value: segs[0].slice(1) };
  if (!['watch', 'playlist', 'feed', 'results', 'music'].includes(segs[0])) {
    return { kind: 'custom', value: segs[0] };
  }
  return null;
}

/** Резолвит хендл/custom-имя в channel ID через HTML страницы канала. */
async function resolveToChannelId(kind, value) {
  if (kind === 'id') return /^UC[A-Za-z0-9_-]{20,}$/.test(value) ? value : null;
  const candidates = [];
  if (kind === 'handle') {
    candidates.push(`https://www.youtube.com/@${encodeURIComponent(value)}`);
    candidates.push(`https://music.youtube.com/@${encodeURIComponent(value)}`);
  } else if (kind === 'user') {
    candidates.push(`https://www.youtube.com/user/${encodeURIComponent(value)}`);
  } else {
    candidates.push(`https://www.youtube.com/c/${encodeURIComponent(value)}`);
    candidates.push(`https://www.youtube.com/@${encodeURIComponent(value)}`);
  }
  for (const url of candidates) {
    try {
      const html = await fetchText(url);
      const patterns = [
        /"channelId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/,
        /<meta\s+itemprop="channelId"\s+content="(UC[A-Za-z0-9_-]+)"/i,
        /channel_id=(UC[A-Za-z0-9_-]+)/,
        /"externalId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/,
      ];
      for (const re of patterns) {
        const m = re.exec(html);
        if (m) return m[1];
      }
    } catch {
      // пробуем следующий кандидат
    }
  }
  return null;
}

function parseRss(xml) {
  const entries = String(xml || '').split(/<entry>/).slice(1);
  const out = [];
  for (const e of entries) {
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(e)?.[1]?.trim();
    const title = /<title>([^<]*)<\/title>/.exec(e)?.[1]?.trim() || '';
    const author = /<author>\s*<name>([^<]*)<\/name>/.exec(e)?.[1]?.trim() || '';
    const thumb = /<media:thumbnail[^>]*url="([^"]+)"/.exec(e)?.[1];
    if (id && title) {
      out.push({
        title,
        url: `https://www.youtube.com/watch?v=${id}`,
        author: author || 'YouTube',
        ...(thumb ? { thumbnail: thumb } : {}),
      });
    }
  }
  return out;
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

  const rawUrl = q.get('url');
  let channelId = q.get('channel_id');
  if (!channelId && rawUrl) {
    const key = extractChannelKey(rawUrl);
    if (!key) {
      send(res, 400, { error: 'Ссылка не похожа на канал YouTube (нужны /channel/UC…, /@handle, /c/имя или /user/имя).' });
      return;
    }
    channelId = await resolveToChannelId(key.kind, key.value);
    if (!channelId) {
      send(res, 404, { error: `Не удалось определить channel ID для «${rawUrl}».` });
      return;
    }
  }
  if (!channelId) {
    send(res, 400, { error: 'Передайте url= (ссылку канала) или channel_id=UC….' });
    return;
  }

  try {
    const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
    const items = parseRss(xml);
    send(res, 200, { channelId, total: items.length, items });
  } catch (e) {
    send(res, 502, { error: `YouTube RSS недоступен: ${e?.message || 'сеть'}` });
  }
}
