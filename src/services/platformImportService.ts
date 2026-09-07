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

export function extractYouTubeChannelId(url: string): string | null {
  const m = /youtube\.com\/(?:c\/|channel\/)([A-Za-z0-9_-]+)/i.exec(url.trim());
  return m ? m[1] : null;
}

// Несколько хостов (RSS YouTube, «сырые» ответы) не отдают CORS-заголовки браузеру.
// Для таких чтений используем публичный CORS-прокси (только GET, без авторизации).
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

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

async function importViaSoundCloudOEmbed(url: string): Promise<ImportedItem[]> {
  const j = await fetchJson(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`);
  const title = String(j.title || '').trim();
  const author = String(j.author_name || '').trim();
  if (!title) return [];
  // oEmbed также отвечает на профили/главные страницы, но импортировать можно только
  // конкретные треки/плейлисты — иначе в плеере SoundCloud появится
  // «You have not provided a valid SoundCloud URL».
  if (!isSoundCloudTrackUrl(url)) return [];
  return [
    {
      title,
      url: sanitizePlatformUrl(url),
      author,
      thumbnail: j.thumbnail_url ? String(j.thumbnail_url) : undefined,
    },
  ];
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

export async function fetchYouTubeItems(url: string): Promise<{ items: ImportedItem[]; warnings: string[] }> {
  const warnings: string[] = [];
  const trimmed = sanitizePlatformUrl(url);
  let items: ImportedItem[] = [];
  try {
    const vid = youtubeVideoId(trimmed);
    if (vid) {
      items = await importViaYouTubeOEmbed(trimmed);
      if (items.length === 0) warnings.push('YouTube не вернул данные по видео.');
    } else {
      const channelId = extractYouTubeChannelId(trimmed);
      if (!channelId) {
        warnings.push('Ссылка должна быть на видео (watch?v=...) или канал вида .../channel/ID.');
      } else {
        try {
          items = await importYouTubeChannelRss(channelId);
          if (items.length === 0) warnings.push('В канале не найдено видео.');
        } catch {
          warnings.push(
            'Не удалось загрузить список видео канала YouTube. Проверьте ссылку и интернет или импортируйте одиночные ссылки на видео.'
          );
        }
      }
    }
  } catch (e: any) {
    warnings.push(`YouTube: ${e?.message || 'сеть недоступна'}. Проверьте ссылку и интернет.`);
  }
  return { items, warnings };
}

export async function fetchSoundCloudItems(url: string): Promise<{ items: ImportedItem[]; warnings: string[] }> {
  const warnings: string[] = [];
  const trimmed = sanitizePlatformUrl(url);
  const isTrack = isSoundCloudTrackUrl(trimmed);
  let items: ImportedItem[] = [];
  try {
    items = await importViaSoundCloudOEmbed(trimmed);
    if (items.length === 0) {
      warnings.push(
        isTrack
          ? 'SoundCloud не вернул данные по треку. Проверьте ссылку или попробуйте позже.'
          : 'Это профиль: для импорта из SoundCloud вставьте ссылку на конкретный трек или плейлист (on.soundcloud.com тоже подходит).'
      );
    }
  } catch (e: any) {
    warnings.push(
      isTrack
        ? `SoundCloud: не удалось получить трек (${e?.message || 'сеть недоступна'}). Проверьте ссылку и интернет.`
        : 'SoundCloud: для импорта вставьте ссылку на конкретный трек или плейлист (страница профиля не поддерживается).'
    );
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