import type { Track } from '../types/track';

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
  return t as Track;
}