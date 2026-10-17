// Проверка импорта каналов YouTube Music (music.youtube.com/channel/… и /@handle).
// Эмулирует клиентскую логику: extractYouTubeChannelId → (резолв handle) → RSS
// → элементы импорта. Запуск: node _yt-music-check.mjs
import { parseTrackCollaborators } from './src/services/collabParser.ts';

// === Копии логики из platformImportService (для проверки) ===
const extractYouTubeChannelId = (url) => {
  const u = url.trim();
  let m = /youtube\.com\/channel\/([A-Za-z0-9_-]+)/i.exec(u);
  if (m) return m[1];
  m = /youtube\.com\/c\/([A-Za-z0-9_-]+)/i.exec(u);
  if (m) return m[1];
  m = /youtube\.com\/@([A-Za-z0-9_.-]+)/i.exec(u);
  if (m) return m[1];
  m = /youtube\.com\/([A-Za-z0-9_-]+)$/i.exec(u);
  if (m) return m[1];
  return null;
};

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
async function fetchText(url, timeoutMs = 15000) {
  const attempt = async (u) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(u, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    return await attempt(url);
  } catch {
    return await attempt(`${CORS_PROXY}${encodeURIComponent(url)}`);
  }
}

async function resolveHandle(handle) {
  // Хендлы могут существовать только на одном из хостов (YT Music и YouTube
  // не всегда совпадают), поэтому пробуем оба: сначала www, затем music.
  for (const host of ['www.youtube.com', 'music.youtube.com']) {
    try {
      const html = await fetchText(`https://${host}/@${handle}`);
      let m = /"channelId"\s*:\s*"([A-Za-z0-9_-]+)"/.exec(html);
      if (m) return m[1];
      m = /<meta\s+itemprop="channelId"\s+content="([A-Za-z0-9_-]+)"/i.exec(html);
      if (m) return m[1];
      m = /<link\s+rel="alternate"\s+type="application\/rss\+xml"\s+href="[^"]+channel_id=([A-Za-z0-9_-]+)"/i.exec(html);
      if (m) return m[1];
      m = /"externalId"\s*:\s*"([A-Za-z0-9_-]+)"/.exec(html);
      if (m && /^UC/.test(m[1])) return m[1];
    } catch {
      // пробуем следующий хост
    }
  }
  return null;
}

async function rssEntries(channelId) {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
  const entries = xml.split(/<entry>/).slice(1);
  const out = [];
  for (const e of entries) {
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(e)?.[1]?.trim();
    const title = /<title>([^<]+)<\/title>/.exec(e)?.[1]?.trim();
    const author = /<author>\s*<name>([^<]+)<\/name>/.exec(e)?.[1]?.trim();
    if (id && title) out.push({ id, title, author: author || 'YouTube' });
  }
  return out;
}

// === Проверка ===
const links = [
  'https://music.youtube.com/channel/UCUy9T12qgc4KiHm5eAos5Rw',
  'https://music.youtube.com/@mnrgg',
];
for (const link of links) {
  console.log('===', link);
  const key = extractYouTubeChannelId(link);
  console.log('extractYouTubeChannelId →', JSON.stringify(key));
  if (!key) {
    console.log('FAIL: канал не распознан');
    process.exitCode = 1;
    continue;
  }
  let channelId = key;
  if (!/^UC[A-Za-z0-9_-]{20,}$/.test(channelId)) {
    const resolved = await resolveHandle(channelId.startsWith('@') ? channelId.slice(1) : channelId);
    console.log('handle →', resolved);
    if (!resolved) {
      console.log('FAIL: handle не резолвится');
      process.exitCode = 1;
      continue;
    }
    channelId = resolved;
  }
  const entries = await rssEntries(channelId);
  console.log('RSS: каналов-видео', entries.length);
  for (const it of entries.slice(0, 8)) {
    const pc = parseTrackCollaborators(it.title, { mainAuthor: it.author, allowArtistSplit: false });
    const bits = [];
    if (pc.feat.length) bits.push('feat: ' + pc.feat.join(', '));
    if (pc.beatmakers.length) bits.push('prod: ' + pc.beatmakers.join(', '));
    if (pc.mixers.length) bits.push('mix: ' + pc.mixers.join(', '));
    console.log(`- ${it.title} | автор: ${it.author}${bits.length ? ' | ' + bits.join(' | ') : ''}`);
  }
  if (entries.length === 0) {
    console.log('FAIL: RSS пуст');
    process.exitCode = 1;
  }
}
console.log(process.exitCode ? 'YT MUSIC: ЕСТЬ ОШИБКИ' : 'YT MUSIC: всё ок');
