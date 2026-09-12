import { createTrack, updateTrack } from './trackService';
import { createBeat } from './beatsService';
import type { Track } from '../types/track';
import { detectPlatform, youtubeVideoId } from '../types/track';
import { parseTrackCollaborators } from './collabParser';

export interface ImportedItem {
  title: string;
  url: string;
  author: string;
  thumbnail?: string;
  /** Со-артисты из шапки названия («A x B — Song») и со-кредитов (publisher_artist). */
  extraArtists?: string[];
  /** Участники «feat. / ft. / при участии». */
  feat?: string[];
  /** «prod by …» → битмейкеры. */
  beatmakers?: string[];
  /** «mixed by …» → микс-инженеры. */
  mixers?: string[];
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
  /** Имя изготовителя бита (из профиля): пишется в записи бита. */
  beatmakerName?: string;
}

export function isYouTubeHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith('youtube.com') || h === 'youtu.be' || h === 'music.youtube.com';
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
  const u = url.trim();
  // Формат /channel/ID
  const m1 = /youtube\.com\/channel\/([A-Za-z0-9_-]+)/i.exec(u);
  if (m1) return m1[1];
  // Формат /c/имя
  const m2 = /youtube\.com\/c\/([A-Za-z0-9_-]+)/i.exec(u);
  if (m2) return m2[1];
  // Формат /@handle
  const m3 = /youtube\.com\/@([A-Za-z0-9_.-]+)/i.exec(u);
  if (m3) return m3[1];
  // Формат youtube.com/имя (без префикса)
  const m4 = /youtube\.com\/([A-Za-z0-9_-]+)$/i.exec(u);
  if (m4) return m4[1];
  return null;
}

/** Проверяет, является ли ссылка ссылкой на YouTube Music */
export function isYouTubeMusicUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'music.youtube.com';
  } catch {
    return false;
  }
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

/**
 * Адрес serverless-прокси импорта каналов YouTube (api/youtube-rss.mjs).
 * RSS youtube.com и страницы каналов не отдают CORS браузеру, публичные
 * CORS-прокси нестабильны — поэтому канал читает наша Vercel-функция.
 * По умолчанию — тот же origin (SPA на Vercel); для GitHub Pages задайте
 * VITE_YOUTUBE_PROXY_URL — полный URL функции.
 */
const YOUTUBE_RSS_PROXY =
  (import.meta.env.VITE_YOUTUBE_PROXY_URL as string | undefined)?.trim() || '/api/youtube-rss';

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

async function importViaYouTubeOEmbed(rawUrl: string): Promise<ImportedItem[]> {
  // music.youtube.com/watch?v=… — тот же трек, oEmbed-эндпоинт принимает
  // ссылки www.youtube.com, поэтому для запроса нормализуем хост.
  const url = rawUrl.replace(/\/\/music\.youtube\.com\//i, '//www.youtube.com/');
  const j = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
  const title = String(j.title || '').trim();
  const author = String(j.author_name || '').trim();
  if (!title) return [];
  // feat./prod by из названия; сплит со-артистов по «x» отключён — в
  // YouTube-названиях слишком много шума («2 x Official Video» и т.п.).
  const pc = parseTrackCollaborators(title, { mainAuthor: author, allowArtistSplit: false });
  return [
    {
      title,
      url,
      author,
      thumbnail: j.thumbnail_url ? String(j.thumbnail_url) : undefined,
      ...(pc.feat.length ? { feat: pc.feat } : {}),
      ...(pc.beatmakers.length ? { beatmakers: pc.beatmakers } : {}),
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
  /**
   * Канонический URL профиля из oEmbed (author_url). Короткие ссылки
   * on.soundcloud.com/… в прокси отправлять не нужно — отправляем полный URL.
   */
  profileUrl?: string;
}

async function importViaSoundCloudOEmbed(url: string): Promise<SoundCloudEmbedResult> {
  const j = await fetchJson(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`);
  const title = String(j.title || '').trim();
  const author = String(j.author_name || '').trim();
  const type = j.html ? extractSoundCloudEmbedType(String(j.html)) : 'unknown';
  if (!title) return { items: [], type };
  // Профиль (страница пользователя) импортировать как трек нельзя — получится
  // мусорная карточка, а плеер не сможет её проиграть. Трек/плейлист — можно.
  if (type === 'profile') {
    return {
      items: [],
      type,
      profileName: author,
      profileUrl: String(j.author_url || '').trim() || undefined,
    };
  }
  if (type === 'unknown') return { items: [], type };
  // Участники из названия; если там пусто — пробуем описание трека
  // (в описании часто пишут «prod by …» прописью), как в TrackForm.
  const pc = parseTrackCollaborators(title, { mainAuthor: author });
  const desc = String(j.description || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const dc = desc.trim() ? parseTrackCollaborators(desc, { mainAuthor: author, allowArtistSplit: false }) : null;
  const beatmakers = pc.beatmakers.length ? pc.beatmakers : dc?.beatmakers || [];
  const featNames = pc.feat.length ? pc.feat : dc?.feat || [];
  const mixers = pc.mixers.length ? pc.mixers : dc?.mixers || [];
  // Со-артисты: из названия + из описания (для релизов с несколькими авторами)
  const extraArtists = [...pc.extraArtists];
  if (dc?.extraArtists.length) {
    for (const a of dc.extraArtists) {
      if (!extraArtists.some((x) => x.toLowerCase() === a.toLowerCase())) {
        extraArtists.push(a);
      }
    }
  }
  return {
    items: [
      {
        title,
        url: sanitizePlatformUrl(url),
        author,
        thumbnail: j.thumbnail_url ? String(j.thumbnail_url) : undefined,
        ...(extraArtists.length ? { extraArtists } : {}),
        ...(featNames.length ? { feat: featNames } : {}),
        ...(beatmakers.length ? { beatmakers } : {}),
        ...(mixers.length ? { mixers } : {}),
      },
    ],
    type,
  };
}

/**
 * Резолвит YouTube handle (@handle) в channel ID через страницу канала.
 * Хендлы могут существовать только на одном из хостов (YT Music и YouTube
 * не всегда совпадают), поэтому пробуем оба: www, затем music.
 * Возвращает channel ID или null, если не удалось определить.
 */
async function resolveYouTubeHandleToChannelId(handle: string): Promise<string | null> {
  for (const host of ['www.youtube.com', 'music.youtube.com']) {
    try {
      const url = `https://${host}/@${encodeURIComponent(handle)}`;
      const html = await fetchText(url, 15000);
      // Ищем channel ID в meta-тегах или JSON-LD
      const m1 = /"channelId"\s*:\s*"([A-Za-z0-9_-]+)"/.exec(html);
      if (m1) return m1[1];
      const m2 = /<meta\s+itemprop="channelId"\s+content="([A-Za-z0-9_-]+)"/i.exec(html);
      if (m2) return m2[1];
      // Ищем RSS link
      const m3 = /<link\s+rel="alternate"\s+type="application\/rss\+xml"\s+href="[^"]+channel_id=([A-Za-z0-9_-]+)"/i.exec(html);
      if (m3) return m3[1];
      const m4 = /"externalId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/.exec(html);
      if (m4) return m4[1];
    } catch {
      // пробуем следующий хост
    }
  }
  return null;
}

/**
 * Импорт канала через наш serverless-прокси (api/youtube-rss.mjs):
 * серверно резолвит channel ID (включая @handle и music.youtube.com) и
 * читает RSS. Основной путь — RSS/публичные CORS-прокси нестабильны.
 * При недоступности прокси — фолбэк на старый путь (RSS через CORS-фолбэк).
 */
async function importYouTubeChannelViaProxy(rawUrl: string): Promise<ImportedItem[]> {
  const endpoint = new URL(YOUTUBE_RSS_PROXY, window.location.origin);
  endpoint.searchParams.set('url', rawUrl);
  const res = await Promise.race<Response>([
    fetch(endpoint.toString()),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('таймаут')), 25000)),
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
  const out: ImportedItem[] = [];
  for (const t of raw) {
    const title = String(t?.title || '').trim();
    const url = String(t?.url || '').trim();
    if (!title || !/^https:\/\/(www\.)?youtube\.com\/watch/i.test(url)) continue;
    out.push({
      title,
      url,
      author: String(t?.author || '').trim() || 'YouTube',
      thumbnail: t?.thumbnail ? String(t.thumbnail) : undefined,
    });
  }
  return out;
}

async function importYouTubeChannelRss(channelIdOrHandle: string): Promise<ImportedItem[]> {
  // Проверяем, является ли ID handle'ом (начинается с @ или не похож на обычный channel ID)
  let channelId = channelIdOrHandle;
  if (channelId.startsWith('@') || !/^UC[A-Za-z0-9_-]{20,}$/.test(channelId)) {
    // Это может быть handle - пробуем резолвить
    const handle = channelId.startsWith('@') ? channelId.slice(1) : channelId;
    const resolved = await resolveYouTubeHandleToChannelId(handle);
    if (resolved) {
      channelId = resolved;
    } else {
      // Пробуем как user (старый формат)
      return await importYouTubeUserRss(handle);
    }
  }
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

/** Импорт по старому формату username (пробуем через user= в RSS) */
async function importYouTubeUserRss(username: string): Promise<ImportedItem[]> {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?user=${encodeURIComponent(username)}`);
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

export function dedupe(
  items: ImportedItem[],
  existingTracks: Track[]
): { fresh: ImportedItem[]; duplicates: ImportedItem[]; skipped: number } {
  const known = new Set(
    existingTracks.map((t) => (t.platformUrl || '').trim().toLowerCase()).filter(Boolean)
  );
  const out: ImportedItem[] = [];
  // Совпадения с уже существующими треками не теряем — их решит окно
  // дубликатов (заменить существующие или добавить как новые).
  const duplicates: ImportedItem[] = [];
  let skipped = 0;
  for (const it of items) {
    const key = it.url.trim().toLowerCase();
    // Повтор ссылки внутри одной пачки — молча пропускаем.
    if (out.some((x) => x.url.trim().toLowerCase() === key)) {
      skipped++;
      continue;
    }
    if (known.has(key)) {
      if (!duplicates.some((x) => x.url.trim().toLowerCase() === key)) duplicates.push(it);
      continue;
    }
    out.push(it);
    known.add(key);
  }
  return { fresh: out, duplicates, skipped: skipped + duplicates.length };
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

/** Пара «трек с площадки → существующий трек на сайте» для окна дубликатов. */
export interface ExistingTrackMatch {
  item: ImportedItem;
  track: Track;
}

/**
 * Сопоставляет треки с площадки с существующими на сайте:
 * сначала по ссылке (platformUrl), затем по названию.
 */
export function matchExistingTracks(items: ImportedItem[], existingTracks: Track[]): ExistingTrackMatch[] {
  const byUrl = new Map<string, Track>();
  const byTitle = new Map<string, Track>();
  for (const t of existingTracks) {
    const u = (t.platformUrl || '').trim().toLowerCase();
    if (u && !byUrl.has(u)) byUrl.set(u, t);
    const ti = (t.title || '').trim().toLowerCase();
    if (ti && !byTitle.has(ti)) byTitle.set(ti, t);
  }
  const out: ExistingTrackMatch[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const url = it.url.trim().toLowerCase();
    const title = (it.title || '').trim().toLowerCase();
    const track = (url && byUrl.get(url)) || (title && byTitle.get(title));
    if (!track) continue;
    const key = url || title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ item: it, track });
  }
  return out;
}

/**
 * «Заменить»: перезаписывает существующие треки данными с площадки —
 * название, участники (со-артисты, битмейкеры, feat), обложка.
 * Статус/колонку/чек-лист/проекты не трогаем. Обложку и platformUrl
 * дозаполняем, только если их не было или пришли с площадки.
 */
export async function updateTracksFromItems(pairs: ExistingTrackMatch[]): Promise<number> {
  let updated = 0;
  for (const { item, track } of pairs) {
    const authors = dedupeNames([item.author.trim(), ...(item.extraArtists || [])]);
    const beatmakers = (item.beatmakers || []).slice();
    const patch: Partial<Track> = {
      title: item.title.trim(),
      artists: authors,
      artistUids: authors.map(() => ''),
      beatmakers,
      beatmakerUids: beatmakers.map(() => ''),
      feat: (item.feat || []).join(', '),
    };
    // Микс-инженеры перезаписываем только если площадка их указала — иначе
    // сотрём вручную проставленные mix by.
    if ((item.mixers || []).length) {
      patch.mixBy = item.mixers!.slice();
      patch.mixByUids = item.mixers!.map(() => '');
    }
    if (item.thumbnail?.trim()) patch.coverUrl = item.thumbnail.trim();
    if (!track.platformUrl?.trim()) patch.platformUrl = sanitizePlatformUrl(item.url);
    try {
      await updateTrack(track.id, patch);
      updated++;
    } catch {
      // отдельный трек не критичен — продолжаем остальные
    }
  }
  return updated;
}

/** Дедупликация имён без учёта регистра, с сохранением порядка. */
function dedupeNames(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const v = String(n || '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export async function persistItems(items: ImportedItem[], opts: ImportOptions): Promise<number> {
  let imported = 0;
  for (const it of items) {
    if (!it.author.trim()) continue;
    // Участники из названия: основной автор + со-артисты; uid-массивы
    // выравниваются по именам ('' = не привязан к пользователю приложения).
    const authors = dedupeNames([it.author.trim(), ...(it.extraArtists || [])]);
    const beatmakers = (it.beatmakers || []).slice();
    const payload: Omit<Track, 'id' | 'createdAt' | 'updatedAt'> = {
      title: it.title.trim(),
      artists: authors,
      artistUids: authors.map(() => ''),
      beatmakers,
      beatmakerUids: beatmakers.map(() => ''),
      mixBy: (it.mixers || []).slice(),
      mixByUids: (it.mixers || []).map(() => ''),
      feat: (it.feat || []).join(', '),
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

/**
 * Сохраняет импортированные элементы как биты (коллекция «beats»).
 * Отличается от persistItems полями бита: beatmaker, статус «published»,
 * платформа-источник и т.д.
 */
export async function persistBeats(items: ImportedItem[], opts: ImportOptions): Promise<number> {
  let imported = 0;
  for (const it of items) {
    if (!it.author.trim()) continue;
    const artists = dedupeNames([it.author.trim(), ...(it.extraArtists || [])]);
    try {
      await createBeat({
        title: it.title.trim(),
        artists,
        artistUids: artists.map(() => ''),
        platformUrl: sanitizePlatformUrl(it.url),
        platform: detectPlatform(it.url),
        coverUrl: it.thumbnail?.trim() || undefined,
        beatmakerUid: opts.uid,
        beatmakerName: opts.beatmakerName?.trim() || it.author.trim(),
        status: 'published',
        createdBy: opts.uid,
      });
      imported++;
    } catch {
      // отдельный бит не критичен — продолжаем остальные
    }
  }
  return imported;
}

export async function fetchYouTubeItems(input: string): Promise<{ items: ImportedItem[]; warnings: string[] }> {
  const warnings: string[] = [];
  const urls = parsePlatformLinks(input, 'youtube');
  if (urls.length === 0) {
    warnings.push(
      'Не найдено ссылок YouTube. Вставьте ссылку на видео, канал или YouTube Music — можно несколько сразу (через запятую или с новой строки).'
    );
    return { items: [], warnings };
  }
  const items: ImportedItem[] = [];
  for (const trimmed of urls) {
    try {
      const vid = youtubeVideoId(trimmed);
      // Канал: /channel/ID, /c/имя, /@handle — и на www.youtube.com, и на
      // music.youtube.com (ID каналов и хендлы у них общие). Проверяем канал
      // ДО ветки YouTube Music: иначе ссылки вида music.youtube.com/channel/…
      // и music.youtube.com/@handle попадают в music-ветку (плейлист/видео),
      // которая для каналов всегда пуста.
      const channelId = vid ? null : extractYouTubeChannelId(trimmed);
      if (vid) {
        const o = await importViaYouTubeOEmbed(trimmed);
        if (o.length === 0) warnings.push(`YouTube не вернул данные по видео «${trimmed}».`);
        items.push(...o);
      } else if (channelId) {
        try {
          // Основной путь — наш serverless-прокси (надёжен из браузера).
          let rss: ImportedItem[] = [];
          try {
            rss = await importYouTubeChannelViaProxy(trimmed);
          } catch {
            // Фолбэк: RSS напрямую/через публичный CORS-прокси.
            rss = await importYouTubeChannelRss(channelId);
          }
          if (rss.length === 0) warnings.push(`В канале «${trimmed}» не найдено видео.`);
          items.push(...rss);
        } catch {
          warnings.push(
            `Не удалось загрузить список видео канала «${trimmed}». Проверьте ссылку и интернет или импортируйте одиночные ссылки на видео.`
          );
        }
      } else if (isYouTubeMusicUrl(trimmed)) {
        // YouTube Music: плейлист (list=…) или страница без стандартного watch?v=
        const musicItems = await fetchYouTubeMusicItems(trimmed);
        if (musicItems.length === 0) {
          warnings.push(`YouTube Music не вернул данные по «${trimmed}».`);
        }
        items.push(...musicItems);
      } else {
        warnings.push(`Ссылка «${trimmed}» должна быть на видео (watch?v=...), канал (.../channel/ID, .../@handle) или YouTube Music.`);
      }
    } catch (e: any) {
      warnings.push(`YouTube: ${e?.message || 'сеть недоступна'}. Проверьте ссылку «${trimmed}» и интернет.`);
    }
  }
  return { items, warnings };
}

/**
 * Импорт треков из YouTube Music (плейлист или отдельный трек).
 * Парсит страницу YouTube Music для извлечения информации о треках.
 */
async function fetchYouTubeMusicItems(url: string): Promise<ImportedItem[]> {
  const out: ImportedItem[] = [];
  try {
    // Извлекаем ID плейлиста или видео из URL
    const playlistMatch = /list=([A-Za-z0-9_-]+)/i.exec(url);
    const videoMatch = /watch\?v=([A-Za-z0-9_-]{11})/i.exec(url);
    const shortVideoMatch = /youtu\.be\/([A-Za-z0-9_-]{11})/i.exec(url);

    if (videoMatch || shortVideoMatch) {
      // Одиночное видео
      const vid = videoMatch ? videoMatch[1] : shortVideoMatch![1];
      const o = await importViaYouTubeOEmbed(`https://www.youtube.com/watch?v=${vid}`);
      out.push(...o);
    } else if (playlistMatch) {
      // Плейлист YouTube Music
      const playlistId = playlistMatch[1];
      // Пробуем получить через oEmbed (только первое видео)
      // Для полного плейлиста нужен другой подход
      const o = await importViaYouTubeOEmbed(`https://www.youtube.com/playlist?list=${playlistId}`);
      out.push(...o);
      // Также пробуем получить через RSS (если плейлист публичный)
      try {
        const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`);
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        if (!doc.querySelector('parsererror')) {
          const entries = Array.from(doc.querySelectorAll('entry'));
          for (const entry of entries) {
            const videoId = entry.querySelector('yt\\:videoId') || entry.querySelector('[yt\\:videoId]');
            const id = videoId?.textContent?.trim() || entry.querySelector('videoId')?.textContent?.trim();
            const title = entry.querySelector('title')?.textContent?.trim() || '';
            const author = entry.querySelector('author > name')?.textContent?.trim() || '';
            const thumb = entry.querySelector('media\\:thumbnail') || entry.querySelector('thumbnail');
            if (id && title) {
              out.push({
                title,
                url: `https://www.youtube.com/watch?v=${id}&list=${playlistId}`,
                author: author || 'YouTube Music',
                thumbnail: thumb?.getAttribute('url') || undefined,
              });
            }
          }
        }
      } catch {
        // RSS не сработал - просто возвращаем то, что есть
      }
    }
  } catch {
    // Игнорируем ошибки
  }
  return out;
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
    const author = String(t?.author || '').trim() || 'SoundCloud';
    const pc = parseTrackCollaborators(title, { mainAuthor: author });
    // Со-кредиты SoundCloud (publisher_artist из прокси): «FLEXXXY & DZZZY» и
    // т.п. — полноценные со-артисты, даже если их нет в заголовке.
    const extraArtists = [...pc.extraArtists];
    const addExtra = (name: string): void => {
      const v = String(name || '').trim();
      if (!v || v.length > 40 || /https?:|prod/i.test(v)) return;
      const k = v.toLowerCase();
      if (k === author.toLowerCase()) return;
      if (extraArtists.some((x) => x.toLowerCase() === k)) return;
      extraArtists.push(v);
    };
    const publisherArtist = String(t?.publisherArtist || '').trim();
    if (publisherArtist) {
      for (const name of publisherArtist.split(/\s*(?:,|&|\/|\+|\b×\b|\bx\b)\s*/i)) addExtra(name);
    }
    // Описание трека: «prod by …», feat прописью, со-артисты — как в oEmbed-пути.
    const desc = String(t?.description || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
    const dc = desc.trim() ? parseTrackCollaborators(desc, { mainAuthor: author, allowArtistSplit: false }) : null;
    const beatmakers = pc.beatmakers.length ? pc.beatmakers : dc?.beatmakers || [];
    const featNames = pc.feat.length ? pc.feat : dc?.feat || [];
    const mixers = pc.mixers.length ? pc.mixers : dc?.mixers || [];
    for (const a of dc?.extraArtists || []) addExtra(a);
    items.push({
      title,
      url: sanitizePlatformUrl(url),
      author,
      thumbnail: t?.thumbnail ? String(t.thumbnail) : undefined,
      ...(extraArtists.length ? { extraArtists } : {}),
      ...(featNames.length ? { feat: featNames } : {}),
      ...(beatmakers.length ? { beatmakers } : {}),
      ...(mixers.length ? { mixers } : {}),
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
        // Отправляем в прокси канонический author_url (полный адрес профиля):
        // исходная ссылка может быть короткой on.soundcloud.com/….
        oembedProfiles.push({ url: r.profileUrl || u, label: r.profileName || u });
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