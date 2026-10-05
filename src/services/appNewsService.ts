import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Новости приложения (Фаза 5): админы публикуют запись в `appNews`,
 * всем авторизованным показывается плашка «что нового» с версией.
 * Правила Firestore: читают все авторизованные, пишут только админы.
 */
export interface AppNewsItem {
  id: string;
  title: string;
  text: string;
  /** Версия приложения, с которой связано обновление (напр. «2.4.0»). */
  version?: string;
  authorUid?: string;
  authorName?: string;
  /** ISO-дата публикации. */
  createdAt: string;
}

const appNewsRef = collection(db, 'appNews');

/** Локальные отметки «прочитано» — per-news id, живут в localStorage. */
const READ_KEY = 'vtg-appnews-read';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getReadNewsIds(): string[] {
  return readJson<string[]>(READ_KEY, []);
}

export function markNewsRead(id: string) {
  try {
    const ids = new Set(getReadNewsIds());
    ids.add(id);
    localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
  } catch {
    /* приватный режим — просто не кэшируем */
  }
}

export function subscribeToAppNews(
  callback: (news: AppNewsItem[]) => void,
  onError?: (e: Error) => void
) {
  const q = query(appNewsRef, orderBy('createdAt', 'desc'), limit(10));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNewsItem)),
    onError
  );
}

export async function createAppNews(
  data: Omit<AppNewsItem, 'id' | 'createdAt'>
) {
  return addDoc(appNewsRef, { ...data, createdAt: new Date().toISOString() });
}

export async function deleteAppNews(id: string) {
  await deleteDoc(doc(db, 'appNews', id));
}
