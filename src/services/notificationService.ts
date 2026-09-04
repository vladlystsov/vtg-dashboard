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
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface AppNotification {
  id: string;
  type: 'artist_request' | 'system' | 'task_created' | 'task_status_changed';
  text: string;
  actorUid: string;
  actorName?: string;
  createdAt: string;
  readBy: string[];
}

const notificationsRef = collection(db, 'notifications');

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
  return addDoc(notificationsRef, sanitize({ ...data, readBy: [] }) as any);
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

export async function deleteNotification(id: string) {
  await deleteDoc(doc(db, 'notifications', id));
}

export async function clearAllNotifications() {
  const snapshot = await getDocs(notificationsRef);
  await Promise.allSettled(
    snapshot.docs.map((d) => deleteDoc(doc(db, 'notifications', d.id)))
  );
}
