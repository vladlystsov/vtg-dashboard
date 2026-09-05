import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

// Локальный кэш аудио-файлов (отдельная БД от данных приложения):
// проигранные «audio»-треки (прямые mp3, например биты из Archive.org) скачиваются
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
  return (await db.get('files', id)) ?? null;
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
    if (existing && existing.url === url) return true;
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
    notify(params.id);
    return true;
  } catch {
    return false;
  }
}

export async function deleteCachedAudio(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('files', id);
  notify(id);
}

export async function clearAudioCache(): Promise<void> {
  const db = await getDB();
  await db.clear('files');
  notify();
}

export async function listCachedAudio(): Promise<CachedAudio[]> {
  const db = await getDB();
  return db.getAll('files');
}