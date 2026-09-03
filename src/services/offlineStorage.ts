import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Track } from '../types/track';

interface VTGDB extends DBSchema {
  tracks: {
    key: string;
    value: Track;
    indexes: { 'by-column': string };
  };
  pendingSync: {
    key: string;
    value: { id: string; action: 'create' | 'update' | 'delete'; data?: Track };
  };
}

let dbPromise: Promise<IDBPDatabase<VTGDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<VTGDB>('vtg-dashboard', 1, {
      upgrade(db) {
        const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
        trackStore.createIndex('by-column', 'column');
        db.createObjectStore('pendingSync', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function saveTrackOffline(track: Track) {
  const db = await getDB();
  await db.put('tracks', track);
}

export async function getTracksOffline(): Promise<Track[]> {
  const db = await getDB();
  return db.getAll('tracks');
}

export async function deleteTrackOffline(id: string) {
  const db = await getDB();
  await db.delete('tracks', id);
}

export async function addPendingSync(action: 'create' | 'update' | 'delete', id: string, data?: Track) {
  const db = await getDB();
  await db.put('pendingSync', { id, action, data });
}

export async function getPendingSync() {
  const db = await getDB();
  return db.getAll('pendingSync');
}

export async function clearPendingSync() {
  const db = await getDB();
  await db.clear('pendingSync');
}

export async function syncOfflineChanges() {
  const pending = await getPendingSync();
  return pending;
}
