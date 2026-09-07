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
  return [
    {
      title,
      url,
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

function dedupe(items: ImportedItem[], existingTracks: Track[]): { fresh: ImportedItem[]; skipped: number } {
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

async function persistItems(items: ImportedItem[], opts: ImportOptions): Promise<number> {
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
      status: 'draft',
      column: 'ideas',
      checklist: [],
      priority: 'medium',
      createdBy: opts.uid,
      releaseType: 'single',
      platformUrl: it.url.trim(),
      coverUrl: it.thumbnail?.trim() || undefined,
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

export async function importFromYouTube(url: string, opts: ImportOptions): Promise<PlatformImportResult> {
  const warnings: string[] = [];
  let items: ImportedItem[] = [];
  try {
    const vid = youtubeVideoId(url.trim());
    if (vid) {
      items = await importViaYouTubeOEmbed(url.trim());
      if (items.length === 0) warnings.push('YouTube не вернул данные по видео.');
    } else {
      const channelId = extractYouTubeChannelId(url.trim());
      if (channelId) {
        try {
          items = await importYouTubeChannelRss(channelId);
          if (items.length === 0) warnings.push('В канале не найдено видео.');
        } catch {
          warnings.push(
            'Не удалось загрузить список видео канала YouTube. Проверьте ссылку и интернет или импортируйте одиночные ссылки на видео.'
          );
        }
      } else {
        warnings.push('Ссылка должна быть на видео (watch?v=...) или канал вида .../channel/ID.');
      }
    }
  } catch (e: any) {
    warnings.push(`YouTube: ${e?.message || 'сеть недоступна'}. Проверьте ссылку и интернет.`);
  }

  const { fresh, skipped } = dedupe(items, opts.existingTracks);
  const imported = fresh.length ? await persistItems(fresh, opts) : 0;
  if (imported < fresh.length) warnings.push('Часть треков не создана (нет автора).');
  return { platform: 'youtube', imported, skipped, warnings };
}

export async function importFromSoundCloud(url: string, opts: ImportOptions): Promise<PlatformImportResult> {
  const warnings: string[] = [];
  let items: ImportedItem[] = [];
  const trimmed = url.trim();
  const isTrack = isSoundCloudTrackUrl(trimmed);
  try {
    // oEmbed умеет отдельные треки (в т.ч. короткие on.soundcloud.com).
    // Профиль/канал целиком oEmbed не отдаёт — на это даём понятное сообщение.
    items = await importViaSoundCloudOEmbed(trimmed);
    if (items.length === 0) {
      warnings.push(
        isTrack
          ? 'SoundCloud не вернул данные по треку. Проверьте ссылку или попробуйте позже.'
          : 'Это профиль/плейлист: список треков SoundCloud не отдаёт из браузера (нужен API-ключ). ' +
            'Для импорта одного трека вставьте ссылку на конкретный трек.'
      );
    }
  } catch (e: any) {
    const detail = e?.message || 'сеть недоступна';
    warnings.push(
      isTrack
        ? `SoundCloud: не удалось получить трек (${detail}). Проверьте ссылку и интернет.`
        : `SoundCloud: ${detail}. Если это профиль — список треков профиля из браузера не получить без API-ключа; вставьте ссылку на конкретный трек.`
    );
  }

  const { fresh, skipped } = dedupe(items, opts.existingTracks);
  const imported = fresh.length ? await persistItems(fresh, opts) : 0;
  if (imported < fresh.length) warnings.push('Часть треков не создана (нет автора).');
  return { platform: 'soundcloud', imported, skipped, warnings };
}