import type { Track } from '../types/track';
import { resolveStorageUrl } from '../services/b2StorageService';

/** Поля трека со ссылками на файлы в хранилище. */
const STORAGE_URL_FIELDS = ['coverUrl', 'personalCoverUrl', 'platformUrl', 'projectZipUrl'] as const;

/**
 * Нормализация треков, прочитанных из Firestore/IndexedDB.
 * Поле projectZips исторически могло сохраниться как объект-карта
 * { "0": {...}, "1": {...} } (при обновлении через FieldPath по индексам),
 * а компоненты ожидают массив. Приводим к массиву, сортируя по числовым ключам.
 */
export function normalizeTrack(raw: any): Track {
  const t = { ...raw } as any;
  if (t.projectZips && !Array.isArray(t.projectZips)) {
    if (typeof t.projectZips === 'object') {
      t.projectZips = Object.keys(t.projectZips)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => t.projectZips[k]);
    } else {
      t.projectZips = undefined;
    }
  }
  // Ссылки на файлы — на актуальный прокси хранилища: в записях могли
  // остаться адреса прежнего домена (Vercel).
  for (const field of STORAGE_URL_FIELDS) {
    if (typeof t[field] === 'string') t[field] = resolveStorageUrl(t[field]);
  }
  if (Array.isArray(t.projectZips)) {
    t.projectZips = t.projectZips.map((z: any) =>
      z && typeof z.zipUrl === 'string' ? { ...z, zipUrl: resolveStorageUrl(z.zipUrl) } : z
    );
  }
  return t as Track;
}