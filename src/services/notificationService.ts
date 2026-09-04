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
  type: 'artist_request' | 'system' | 'task_created' | 'task_status_changed';
  text: string;
  actorUid: string;
  actorName?: string;
  createdAt: string;
  readBy: string[];
  hiddenBy?: string[];
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
  onError?: (e: Error) => void,
  uid?: string
) {
  const q = query(notificationsRef, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as AppNotification))
        .filter((n) => !(n as any).hidden)
        .filter((n) => !uid || !(n.hiddenBy || []).includes(uid))
    );
  }, onError);
}

export async function createNotification(data: Omit<AppNotification, 'id' | 'readBy'>) {
  return addDoc(notificationsRef, sanitize({ ...data, readBy: [], hiddenBy: [] }) as any);
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

export async function deleteNotification(id: string, uid: string, currentHiddenBy: string[] = []) {
  await updateDoc(doc(db, 'notifications', id), {
    hiddenBy: Array.from(new Set([...(currentHiddenBy || []), uid])),
  } as any);
}

export async function clearAllNotifications(notifications: AppNotification[], uid: string) {
  await Promise.allSettled(
    notifications.map((n) =>
      deleteNotification(n.id, uid, n.hiddenBy)
    )
  );
}
