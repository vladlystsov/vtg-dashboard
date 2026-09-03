import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface AppNotification {
  id: string;
  type: 'artist_request' | 'system';
  text: string;
  actorUid: string;
  actorName?: string;
  createdAt: string;
  readBy: string[];
}

const notificationsRef = collection(db, 'notifications');

function sanitize(data: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v === undefined || v === null) continue;
    clean[k] = v;
  }
  return clean;
}

export function subscribeToNotifications(
  callback: (notifications: AppNotification[]) => void,
  onError?: (e: Error) => void
) {
  const q = query(notificationsRef, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification)));
  }, onError);
}

export async function createNotification(data: Omit<AppNotification, 'id' | 'readBy'>) {
  return addDoc(notificationsRef, sanitize({ ...data, readBy: [] }));
}

export async function markNotificationRead(id: string, uid: string, currentReadBy: string[] = []) {
  const ref = doc(db, 'notifications', id);
  await updateDoc(ref, {
    readBy: Array.from(new Set([...(currentReadBy || []), uid])),
  });
}

export async function markAllNotificationsRead(notifications: AppNotification[], uid: string) {
  await Promise.allSettled(
    notifications.map((n) =>
      markNotificationRead(n.id, uid, n.readBy)
    )
  );
}
