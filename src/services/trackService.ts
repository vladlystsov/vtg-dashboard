import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Track, KanbanColumn } from '../types/track';
import { v4 as uuidv4 } from 'uuid';

const tracksRef = collection(db, 'tracks');

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
  const checklist = data.checklist.map((item) => ({
    ...item,
    id: item.id || uuidv4(),
  }));
  const docRef = await addDoc(tracksRef, {
    ...data,
    checklist,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

export async function updateTrack(id: string, data: Partial<Track>) {
  const ref = doc(db, 'tracks', id);
  await updateDoc(ref, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
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
