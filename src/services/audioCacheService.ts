import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

// Локальный кэш аудио-файлов (отдельная БД от данных приложения):
// проигранные «audio»-треки (прямые mp3 из хранилища) скачиваются
// в IndexedDB, чтобы повторно слушать без задержек сети и в офлайне.
// SoundCloud/YouTube так кэшировать нельзя — они работают через встроенные плееры.

export interface CachedAudio {
  id: string;
  url: string;
  title: string;
  blob: Blob;
  size: number;
  cachedAt: string;
}

interface AudioCacheDB extends DBSchema {
  files: {
    key: string;
    value: CachedAudio;
  };
}

let dbPromise: Promise<IDBPDatabase<AudioCacheDB>> | null = null;

function getDB(): Promise<IDBPDatabase<AudioCacheDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AudioCacheDB>('vtg-audio-cache', 1, {
      upgrade(db) {
        db.createObjectStore('files', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

type CacheListener = (affectedId?: string) => void;
const listeners = new Set<CacheListener>();

// Горячий кэш уже прочитанных блобов. Нужен, чтобы запуск трека по клику не
// ждал асинхронного открытия IndexedDB: браузеры (особенно Safari/Firefox)
// разрешают play() только синхронно внутри пользовательского жеста. Пока
// проигрыватель ждал getCachedAudio(), жест «сгорал», и новый трек (которого
// ещё нет в кэше) не запускался на сайте, хотя в приложении играл.
const hotBlobs = new Map<string, Blob>();

/** Блоб из горячего кэша без await (или null). */
export function peekCachedAudio(id: string): Blob | null {
  return hotBlobs.get(id) ?? null;
}

function notify(affectedId?: string) {
  for (const fn of listeners) {
    try {
      fn(affectedId);
    } catch {
      /* ignore */
    }
  }
}

// Подписка на изменения кэша: affectedId — id затронутого трека
// (undefined — очищен весь кэш).
export function onAudioCacheChange(fn: CacheListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function getCachedAudio(id: string): Promise<CachedAudio | null> {
  const db = await getDB();
  const item = (await db.get('files', id)) ?? null;
  if (item) hotBlobs.set(id, item.blob);
  return item;
}

// Скачивает файл и кладёт в кэш. Возвращает false, если скачать не удалось
// (нет сети / CORS у стороннего хоста) — проигрывание всё равно идёт по сети.
export async function cacheAudio(params: {
  id: string;
  url: string;
  title: string;
}): Promise<boolean> {
  try {
    const url = params.url.trim();
    if (!url) return false;
    const db = await getDB();
    const existing = await db.get('files', params.id);
    if (existing && existing.url === url) {
      hotBlobs.set(params.id, existing.blob);
      return true;
    }
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return false;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return false;
    await db.put('files', {
      id: params.id,
      url,
      title: params.title,
      blob,
      size: blob.size,
      cachedAt: new Date().toISOString(),
    });
    hotBlobs.set(params.id, blob);
    notify(params.id);
    return true;
  } catch {
    return false;
  }
}

export async function deleteCachedAudio(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('files', id);
  hotBlobs.delete(id);
  notify(id);
}

export async function clearAudioCache(): Promise<void> {
  const db = await getDB();
  await db.clear('files');
  hotBlobs.clear();
  notify();
}

export async function listCachedAudio(): Promise<CachedAudio[]> {
  const db = await getDB();
  return db.getAll('files');
}