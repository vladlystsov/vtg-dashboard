import { createTrack } from './trackService';
import type { Track } from '../types/track';
import { youtubeVideoId } from '../types/track';

export interface ImportedItem {
  title: string;
  url: string;
  author: string;
  thumbnail?: string;
}

export interface PlatformImportResult {
  platform: 'youtube' | 'soundcloud';
  imported: number;
  skipped: number;
  warnings: string[];
}

interface ImportOptions {
  uid: string;
  existingTracks: Track[];
}

export function isYouTubeHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith('youtube.com') || h === 'youtu.be';
  } catch {
    return false;
  }
}

export function isSoundCloudHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith('soundcloud.com');
  } catch {
    return false;
  }
}

/**
 * Чинит криво вставленные ссылки из приложений/мессенджеров:
 * обрезает пробелы и хвостовую пунктуацию (запятая/точка после ссылки),
 * добавляет протокол, если пользователь вставил ссылку без него.
 */
export function sanitizePlatformUrl(url: string): string {
  let u = (url || '').trim();
  u = u.replace(/[,.!?;:'"<>|]+$/, '');
  if (/^(?:on\.|m\.|www\.)?soundcloud\.com\//i.test(u)) return 'https://' + u;
  if (/^(?:m\.|music\.|www\.)?youtube\.com\//i.test(u)) return 'https://' + u;
  if (/^youtu\.be\//i.test(u)) return 'https://' + u;
  return u;
}

/**
 * Разбирает поле ввода на отдельные ссылки одной площадки.
 * Пользователь может вставить сразу несколько ссылок — через запятую,
 * пробел или с новой строки (например, список треков из профиля).
 * Каждая ссылка чинится (sanitizePlatformUrl), дубликаты отбрасываются.
 */
export function parsePlatformLinks(input: string, platform: 'youtube' | 'soundcloud'): string[] {
  const parts = String(input || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const u = sanitizePlatformUrl(p);
    const ok = platform === 'soundcloud' ? isSoundCloudHost(u) : isYouTubeHost(u);
    if (!ok) continue;
    const key = u.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

/**
 * Похоже ли на ссылку на конкретный трек, а не профиль/плейлист:
 * короткие on.soundcloud.com/... и ссылки вида soundcloud.com/user/track.
 */
export function isSoundCloudTrackUrl(url: string): boolean {
  const h = (url || '').toLowerCase();
  if (h.includes('on.soundcloud.com') || h.includes('snd.sc')) return true;
  if (!isSoundCloudHost(url)) return false;
  try {
    const path = new URL(url).pathname;
    const segs = path.split('/').filter(Boolean);
    return segs.length >= 2;
  } catch {
    return false;
  }
}

/**
 * Похоже ли на ссылку на профиль SoundCloud (а не на трек/плейлист):
 * soundcloud.com/<пермалинк> или страница раздела профиля
 * (…/tracks, …/likes, …/sets и т.п. — см. SOUNDCLOUD_PROFILE_SECTIONS).
 * soundcloud.com/<user>/<track> — это трек, не профиль;
 * on.soundcloud.com/… — короткие ссылки, всегда ведут на трек.
 */
export function isSoundCloudProfileUrl(url: string): boolean {
  if (!isSoundCloudHost(url)) return false;
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase() === 'on.soundcloud.com') return false;
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length === 1) return true; // soundcloud.com/<пермалинк>
    return segs.length === 2 && SOUNDCLOUD_PROFILE_SECTIONS.test(segs[1]);
  } catch {
    return false;
  }
}

export function extractYouTubeChannelId(url: string): string | null {
  const m = /youtube\.com\/(?:c\/|channel\/)([A-Za-z0-9_-]+)/i.exec(url.trim());
  return m ? m[1] : null;
}

// Несколько хостов (RSS YouTube, «сырые» ответы) не отдают CORS-заголовки браузеру.
// Для таких чтений используем публичный CORS-прокси (только GET, без авторизации).
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

/** Разделы страницы профиля SoundCloud (второй сегмент пути после пермалинка). */
const SOUNDCLOUD_PROFILE_SECTIONS = /^(tracks|likes|reposts|comments|followers|followings|sets|podcasts)$/i;

/**
 * Адрес serverless-прокси профиля SoundCloud (см. api/soundcloud-profile.mjs).
 * По умолчанию — тот же origin (если SPA развёрнуто на Vercel вместе с api/).
 * Для GitHub Pages задайте VITE_SOUNDCLOUD_PROXY_URL — полный URL развёрнутой
 * функции (см. SOUNDCLOUD_API.md, «Развёртывание»).
 */
const SOUNDCLOUD_PROFILE_PROXY =
  (import.meta.env.VITE_SOUNDCLOUD_PROXY_URL as string | undefined)?.trim() || '/api/soundcloud-profile';

async function fetchJson(url: string, timeoutMs = 15000): Promise<any> {
  const text = await fetchTextWithCorsFallback(url, timeoutMs);
  return JSON.parse(text);
}

/**
 * Читает текст с попыткой двух запросов:
 * 1) напрямую (работает, если хост отдаёт CORS-заголовки, например oEmbed YouTube);
 * 2) через публичный CORS-прокси (когда прямой запрос блокируется CORS — например
 *    RSS YouTube, который из браузера не получить напрямую).
 */
async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  return fetchTextWithCorsFallback(url, timeoutMs);
}

async function fetchTextWithCorsFallback(url: string, timeoutMs: number): Promise<string> {
  const attempt = async (u: string) => {
    const res = await Promise.race<Response>([
      fetch(u),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('таймаут')), timeoutMs)),
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };
  try {
    return await attempt(url);
  } catch (directErr) {
    // При CORS-блокировке прямой fetch падает в браузере — пробуем через прокси.
    return await attempt(`${CORS_PROXY}${encodeURIComponent(url)}`);
  }
}

async function importViaYouTubeOEmbed(url: string): Promise<ImportedItem[]> {
  const j = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
  const title = String(j.title || '').trim();
  const author = String(j.author_name || '').trim();
  if (!title) return [];
  return [
    {
      title,
      url,
      author,
      thumbnail: j.thumbnail_url ? String(j.thumbnail_url) : undefined,
    },
  ];
}

/**
 * Тип объекта SoundCloud, определённый по oEmbed-ответу.
 * SoundCloud в iframe плеера зашивает внутренний URL
 * api.soundcloud.com/{tracks|playlists|users}/{id} — по нему надёжно
 * отличаем трек от плейлиста и профиля (страницы пользователя).
 */
export type SoundCloudEmbedType = 'track' | 'playlist' | 'profile' | 'unknown';

export function extractSoundCloudEmbedType(iframeHtml: string): SoundCloudEmbedType {
  let decoded = iframeHtml || '';
  try {
    // В html могут встречаться «голые» % (например width="100%") — decodeURIComponent
    // на них бросает URIError, поэтому оборачиваем.
    decoded = decodeURIComponent(decoded);
  } catch {
    // оставляем строку как есть — регекс ниже матчит и закодированный, и сырой вид
  }
  const m = /api\.soundcloud\.com(?:\/|%2F)(tracks|playlists|users)(?:\/|%2F)/i.exec(decoded);
  if (!m) {
    // Страховка: без явного /tracks|playlists|users/ объект не похож на трек —
    // импорт такого «трека» даст ошибку плеера «You have not provided a
    // valid SoundCloud URL».
    return 'unknown';
  }
  if (m[1] === 'users') return 'profile';
  if (m[1] === 'tracks') return 'track';
  return 'playlist';
}

interface SoundCloudEmbedResult {
  items: ImportedItem[];
  type: SoundCloudEmbedType;
  /** Имя профиля, если ссылка вела на страницу пользователя (а не на трек). */
  profileName?: string;
}

async function importViaSoundCloudOEmbed(url: string): Promise<SoundCloudEmbedResult> {
  const j = await fetchJson(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`);
  const title = String(j.title || '').trim();
  const author = String(j.author_name || '').trim();
  const type = j.html ? extractSoundCloudEmbedType(String(j.html)) : 'unknown';
  if (!title) return { items: [], type };
  // Профиль (страница пользователя) импортировать как трек нельзя — получится
  // мусорная карточка, а плеер не сможет её проиграть. Трек/плейлист — можно.
  if (type === 'profile') return { items: [], type, profileName: author };
  if (type === 'unknown') return { items: [], type };
  return {
    items: [
      {
        title,
        url: sanitizePlatformUrl(url),
        author,
        thumbnail: j.thumbnail_url ? String(j.thumbnail_url) : undefined,
      },
    ],
    type,
  };
}

async function importYouTubeChannelRss(channelId: string): Promise<ImportedItem[]> {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('не удалось разобрать RSS');
  const entries = Array.from(doc.querySelectorAll('entry'));
  const out: ImportedItem[] = [];
  for (const entry of entries) {
    const videoId = entry.querySelector('yt\\:videoId') || entry.querySelector('[yt\\:videoId]');
    const id = videoId?.textContent?.trim() || entry.querySelector('videoId')?.textContent?.trim();
    const title = entry.querySelector('title')?.textContent?.trim() || '';
    const author = entry.querySelector('author > name')?.textContent?.trim() || '';
    const thumb = entry.querySelector('media\\:thumbnail') || entry.querySelector('thumbnail');
    if (id && title) {
      out.push({
        title,
        url: `https://www.youtube.com/watch?v=${id}`,
        author: author || 'YouTube',
        thumbnail: thumb?.getAttribute('url') || undefined,
      });
    }
  }
  return out;
}

export function dedupe(items: ImportedItem[], existingTracks: Track[]): { fresh: ImportedItem[]; skipped: number } {
  const known = new Set(
    existingTracks.map((t) => (t.platformUrl || '').trim().toLowerCase()).filter(Boolean)
  );
  const out: ImportedItem[] = [];
  let skipped = 0;
  for (const it of items) {
    const key = it.url.trim().toLowerCase();
    if (known.has(key) || out.some((x) => x.url.trim().toLowerCase() === key)) {
      skipped++;
      continue;
    }
    out.push(it);
    known.add(key);
  }
  return { fresh: out, skipped };
}

/**
 * Дубликаты по названию: треки площадок, чьи названия совпадают с уже
 * существующими на сайте (без учёта регистра и лишних пробелов).
 */
export function findTitleDuplicates(items: ImportedItem[], existingTracks: Track[]): ImportedItem[] {
  if (items.length === 0 || existingTracks.length === 0) return [];
  const known = new Set(
    existingTracks.map((t) => (t.title || '').trim().toLowerCase()).filter(Boolean)
  );
  return items.filter((it) => known.has((it.title || '').trim().toLowerCase()));
}

export async function persistItems(items: ImportedItem[], opts: ImportOptions): Promise<number> {
  let imported = 0;
  for (const it of items) {
    if (!it.author.trim()) continue;
    const payload: Omit<Track, 'id' | 'createdAt' | 'updatedAt'> = {
      title: it.title.trim(),
      artists: [it.author.trim()],
      artistUids: [''],
      beatmakers: [],
      beatmakerUids: [],
      mixBy: [],
      mixByUids: [],
      feat: '',
      project: '',
      // Импортированные треки оставляем только в разделе «Отгружено»:
      // не показываем в «Синглы»/«Сборники» и не таскаем по доске.
      status: 'completed',
      column: 'released',
      checklist: [],
      priority: 'medium',
      createdBy: opts.uid,
      releaseType: 'single',
      platformUrl: sanitizePlatformUrl(it.url),
      coverUrl: it.thumbnail?.trim() || undefined,
      imported: true,
    };
    try {
      await createTrack(payload);
      imported++;
    } catch {
      // отдельный трек не критичен — продолжаем остальные
    }
  }
  return imported;
}

export async function fetchYouTubeItems(input: string): Promise<{ items: ImportedItem[]; warnings: string[] }> {
  const warnings: string[] = [];
  const urls = parsePlatformLinks(input, 'youtube');
  if (urls.length === 0) {
    warnings.push(
      'Не найдено ссылок YouTube. Вставьте ссылку на видео или канал — можно несколько сразу (через запятую или с новой строки).'
    );
    return { items: [], warnings };
  }
  const items: ImportedItem[] = [];
  for (const trimmed of urls) {
    try {
      const vid = youtubeVideoId(trimmed);
      if (vid) {
        const o = await importViaYouTubeOEmbed(trimmed);
        if (o.length === 0) warnings.push(`YouTube не вернул данные по видео «${trimmed}».`);
        items.push(...o);
      } else {
        const channelId = extractYouTubeChannelId(trimmed);
        if (!channelId) {
          warnings.push(`Ссылка «${trimmed}» должна быть на видео (watch?v=...) или канал вида .../channel/ID.`);
        } else {
          try {
            const rss = await importYouTubeChannelRss(channelId);
            if (rss.length === 0) warnings.push(`В канале «${trimmed}» не найдено видео.`);
            items.push(...rss);
          } catch {
            warnings.push(
              `Не удалось загрузить список видео канала «${trimmed}». Проверьте ссылку и интернет или импортируйте одиночные ссылки на видео.`
            );
          }
        }
      }
    } catch (e: any) {
      warnings.push(`YouTube: ${e?.message || 'сеть недоступна'}. Проверьте ссылку «${trimmed}» и интернет.`);
    }
  }
  return { items, warnings };
}

/**
 * Автоимпорт всех треков профиля SoundCloud через наш serverless-прокси
 * (api/soundcloud-profile.mjs: резолвит профиль и выкачивает треки через
 * api-v2.soundcloud.com — см. SOUNDCLOUD_API.md). Напрямую из браузера список
 * треков профиля не получить: у api-v2 закрыт CORS для чужих origin, а страницы
 * и oEmbed soundcloud.com для серверных запросов закрыты антиботом.
 */
async function fetchSoundCloudProfileItems(
  profileUrl: string,
  timeoutMs = 25000
): Promise<{ items: ImportedItem[]; profileLabel: string }> {
  const endpoint = new URL(SOUNDCLOUD_PROFILE_PROXY, window.location.origin);
  endpoint.searchParams.set('url', profileUrl);
  endpoint.searchParams.set('limit', '100');
  const res = await Promise.race<Response>([
    fetch(endpoint.toString()),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('таймаут')), timeoutMs)),
  ]);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let detail = '';
    try {
      detail = String(JSON.parse(body)?.error || '');
    } catch {
      detail = body;
    }
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  const data = await res.json();
  const raw: any[] = Array.isArray(data?.items) ? data.items : [];
  const items: ImportedItem[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const title = String(t?.title || '').trim();
    const url = String(t?.url || '').trim();
    if (!title || !/^https:\/\/soundcloud\.com\//i.test(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      title,
      url: sanitizePlatformUrl(url),
      author: String(t?.author || '').trim() || 'SoundCloud',
      thumbnail: t?.thumbnail ? String(t.thumbnail) : undefined,
    });
  }
  const profileLabel = String(data?.user?.username || data?.user?.permalink || profileUrl);
  return { items, profileLabel };
}

function profileImportWarning(label: string, reason: string): string {
  return (
    `«${label}» — профиль SoundCloud. Автоимпорт всех треков профиля выполняется через наш ` +
    `serverless-прокси (VITE_SOUNDCLOUD_PROXY_URL, см. SOUNDCLOUD_API.md), но он сейчас недоступен (${reason}). ` +
    'Скопируйте из профиля ссылки на нужные треки и вставьте их сюда — можно несколько сразу ' +
    '(через запятую или с новой строки).'
  );
}

export async function fetchSoundCloudItems(input: string): Promise<{ items: ImportedItem[]; warnings: string[] }> {
  const warnings: string[] = [];
  const urls = parsePlatformLinks(input, 'soundcloud');
  if (urls.length === 0) {
    warnings.push(
      'Не найдено ссылок SoundCloud. Вставьте ссылку на профиль или на конкретный трек — можно несколько сразу (через запятую или с новой строки).'
    );
    return { items: [], warnings };
  }
  const items: ImportedItem[] = [];
  // Профили, о которых стало известно по oEmbed (нестандартные ссылки) —
  // пробуем выкачать через прокси после основного цикла.
  const oembedProfiles: { url: string; label: string }[] = [];
  for (const u of urls) {
    // Ссылка на профиль — автоимпорт всех треков через serverless-прокси.
    if (isSoundCloudProfileUrl(u)) {
      try {
        const r = await fetchSoundCloudProfileItems(u);
        if (r.items.length === 0) {
          warnings.push(`В профиле «${r.profileLabel}» не найдено треков.`);
        } else {
          items.push(...r.items);
        }
      } catch (e: any) {
        warnings.push(profileImportWarning(u, e?.message || 'сеть недоступна'));
      }
      continue;
    }
    try {
      const r = await importViaSoundCloudOEmbed(u);
      items.push(...r.items);
      if (r.type === 'profile') {
        oembedProfiles.push({ url: u, label: r.profileName || u });
      } else if (r.type === 'unknown') {
        warnings.push(`SoundCloud не распознал «${u}» — вставьте ссылку на трек или профиль.`);
      }
    } catch (e: any) {
      warnings.push(
        `SoundCloud: не удалось получить трек по «${u}» (${e?.message || 'сеть недоступна'}). Проверьте ссылку и интернет.`
      );
    }
  }
  for (const p of oembedProfiles) {
    try {
      const r = await fetchSoundCloudProfileItems(p.url);
      items.push(...r.items);
    } catch (e: any) {
      warnings.push(profileImportWarning(p.label, e?.message || 'сеть недоступна'));
    }
  }
  return { items, warnings };
}

export async function importFromYouTube(url: string, opts: ImportOptions): Promise<PlatformImportResult> {
  const { items, warnings } = await fetchYouTubeItems(url);
  const { fresh, skipped } = dedupe(items, opts.existingTracks);
  const imported = fresh.length ? await persistItems(fresh, opts) : 0;
  if (imported < fresh.length) warnings.push('Часть треков не создана (нет автора).');
  return { platform: 'youtube', imported, skipped, warnings };
}

export async function importFromSoundCloud(url: string, opts: ImportOptions): Promise<PlatformImportResult> {
  const { items, warnings } = await fetchSoundCloudItems(url);
  const { fresh, skipped } = dedupe(items, opts.existingTracks);
  const imported = fresh.length ? await persistItems(fresh, opts) : 0;
  if (imported < fresh.length) warnings.push('Часть треков не создана (нет автора).');
  return { platform: 'soundcloud', imported, skipped, warnings };
}