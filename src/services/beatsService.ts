import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Beat } from '../types/beat';

const beatsRef = collection(db, 'beats');

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
  return data;
}

function cleanForFirestore(data: any): Record<string, any> {
  const s = sanitize(data);
  return (s && typeof s === 'object' ? s : {}) as Record<string, any>;
}

export function subscribeToBeats(
  callback: (beats: Beat[]) => void,
  onError?: (e: Error) => void
) {
  const q = query(beatsRef, orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const beats = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Beat));
    callback(beats);
  }, onError);
}

export async function createBeat(data: Omit<Beat, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = new Date().toISOString();
  const docRef = await addDoc(beatsRef, cleanForFirestore({
    ...data,
    createdAt: now,
    updatedAt: now,
  }));
  return docRef.id;
}

export async function updateBeat(id: string, data: Partial<Beat>) {
  const ref = doc(db, 'beats', id);
  await updateDoc(ref, cleanForFirestore({
    ...data,
    updatedAt: new Date().toISOString(),
  }));
}

export async function deleteBeat(id: string) {
  await deleteDoc(doc(db, 'beats', id));
}