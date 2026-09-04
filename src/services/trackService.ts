import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Track, KanbanColumn } from '../types/track';
import { v4 as uuidv4 } from 'uuid';

const tracksRef = collection(db, 'tracks');

function sanitize(data: any): any {
  if (data === undefined || data === null) return undefined;
  if (Array.isArray(data)) {
    const out: any[] = [];
    for (const v of data) {
      const s = sanitize(v);
      if (s !== undefined) out.push(s);
    }
    return out;
  }
  if (typeof data === 'object') {
    const clean: Record<string, any> = {};
    for (const k of Object.keys(data)) {
      const s = sanitize((data as Record<string, any>)[k]);
      if (s !== undefined) clean[k] = s;
    }
    return clean;
  }
  if (data === undefined || data === null) return undefined;
  return data;
}

function cleanForFirestore(data: any): Record<string, any> {
  const s = sanitize(data);
  return (s && typeof s === 'object' ? s : {}) as Record<string, any>;
}

export function subscribeToTracks(
  callback: (tracks: Track[]) => void,
  onError?: (e: Error) => void
) {
  const q = query(tracksRef, orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const tracks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Track));
    callback(tracks);
  }, onError);
}

export async function createTrack(data: Omit<Track, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = new Date().toISOString();
  const checklist = (data.checklist || []).map((item) => ({
    ...item,
    id: item.id || uuidv4(),
  }));
  const docRef = await addDoc(tracksRef, cleanForFirestore({
    ...data,
    checklist,
    createdAt: now,
    updatedAt: now,
  }));
  return docRef.id;
}

export async function updateTrack(id: string, data: Partial<Track>) {
  const ref = doc(db, 'tracks', id);
  await updateDoc(ref, cleanForFirestore({
    ...data,
    updatedAt: new Date().toISOString(),
  }));
}

export async function deleteTrack(id: string) {
  await deleteDoc(doc(db, 'tracks', id));
}

export async function moveTrack(id: string, newColumn: KanbanColumn) {
  const ref = doc(db, 'tracks', id);
  await updateDoc(ref, {
    column: newColumn,
    updatedAt: new Date().toISOString(),
  });
}

export async function bulkMoveTracks(moves: { id: string; column: KanbanColumn }[]) {
  const batch = writeBatch(db);
  for (const move of moves) {
    const ref = doc(db, 'tracks', move.id);
    batch.update(ref, {
      column: move.column,
      updatedAt: new Date().toISOString(),
    });
  }
  await batch.commit();
}

export async function renameArtistInTracks(uid: string, oldName: string, newName: string) {
  if (!uid || !oldName || !newName || oldName === newName) return;
  const snapshot = await getDocs(tracksRef);
  const oldKey = oldName.toLowerCase();
  const batch = writeBatch(db);
  let changed = 0;

  for (const d of snapshot.docs) {
    const t = d.data() as Track;
    const artistUids = t.artistUids || [];
    const beatmakerUids = t.beatmakerUids || [];
    const mixByUids = t.mixByUids || [];

    const patches: Record<string, any> = {};

    if (artistUids.includes(uid)) {
      const artists = (t.artists || []).slice();
      let nameChanged = false;
      artistUids.forEach((u, i) => {
        if (u === uid) {
          artists[i] = newName;
          nameChanged = true;
        }
      });
      if (!nameChanged) {
        artists.forEach((a, i) => {
          if ((a || '').toLowerCase() === oldKey) {
            artists[i] = newName;
            nameChanged = true;
          }
        });
      }
      if (nameChanged) patches.artists = artists;
    } else if ((t.artists || []).some((a) => (a || '').toLowerCase() === oldKey)) {
      patches.artists = (t.artists || []).map((a) => (a || '').toLowerCase() === oldKey ? newName : a);
    }

    if (beatmakerUids.includes(uid)) {
      const beatmakers = (t.beatmakers || []).slice();
      let nameChanged = false;
      beatmakerUids.forEach((u, i) => {
        if (u === uid) {
          beatmakers[i] = newName;
          nameChanged = true;
        }
      });
      if (!nameChanged) {
        beatmakers.forEach((b, i) => {
          if ((b || '').toLowerCase() === oldKey) {
            beatmakers[i] = newName;
            nameChanged = true;
          }
        });
      }
      if (nameChanged) patches.beatmakers = beatmakers;
    } else if ((t.beatmakers || []).some((b) => (b || '').toLowerCase() === oldKey)) {
      patches.beatmakers = (t.beatmakers || []).map((b) => (b || '').toLowerCase() === oldKey ? newName : b);
    }

    if (mixByUids.includes(uid)) {
      const mixBy = asArrayRaw(t.mixBy).slice();
      let nameChanged = false;
      mixByUids.forEach((u, i) => {
        if (u === uid) {
          mixBy[i] = newName;
          nameChanged = true;
        }
      });
      if (!nameChanged) {
        mixBy.forEach((m, i) => {
          if (((m as string) || '').toLowerCase() === oldKey) {
            mixBy[i] = newName;
            nameChanged = true;
          }
        });
      }
      if (nameChanged) patches.mixBy = mixBy;
    } else if (asArrayRaw(t.mixBy).some((m) => ((m as string) || '').toLowerCase() === oldKey)) {
      patches.mixBy = asArrayRaw(t.mixBy).map((m) => ((m as string) || '').toLowerCase() === oldKey ? newName : m);
    }

    if (Object.keys(patches).length > 0) {
      batch.update(d.ref, cleanForFirestore({ ...patches, updatedAt: new Date().toISOString() }));
      changed++;
    }
  }

  if (changed > 0) {
    await batch.commit();
  }
}

function asArrayRaw(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) return [v];
  return [];
}
