import {
  doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Токен устройства для push. Ключ документа = сам токен (он и уникален,
 * и не даёт одному устройству получить несколько записей при переустановке).
 */
export interface DeviceToken {
  token: string;
  uid: string;
  platform: 'android' | 'web' | 'unknown';
  /** Название приложения/версии — для отладки в админке. */
  app?: string;
  createdAt?: unknown;
  lastSeenAt?: unknown;
}

const devicesRef = collection(db, 'devices');

/** Адрес serverless-функции отправки push (api/push-send.mjs на Vercel). */
const PUSH_API = (import.meta.env.VITE_PUSH_PROXY_URL as string | undefined)?.trim() || '/api/push-send';

function isNative(): boolean {
  const cap = (globalThis as any).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** Публичный VAPID-ключ для web-push (в Android используется FCM). */
const VAPID_KEY = (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined)?.trim();

async function saveToken(token: string, uid: string) {
  const ref = doc(db, 'devices', token);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as DeviceToken) : null;
  await setDoc(
    ref,
    {
      token,
      uid,
      platform: isNative() ? 'android' : 'web',
      app: 'vtg-android',
      lastSeenAt: serverTimestamp(),
      ...(existing ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );
}

export async function unregisterDevice(token: string) {
  try {
    await deleteDoc(doc(db, 'devices', token));
  } catch (e) {
    console.error('push unregister', e);
  }
}

/**
 * Регистрирует устройство для push-уведомлений.
 * В Android используется нативный FCM (Capacitor PushNotifications),
 * в браузере — Web Push через firebase/messaging (если задан VAPID-ключ).
 *
 * Возвращает токен или null, если push недоступен (например, нет
 * разрешения или ключа) — вызывающий код просто работает без него.
 */
export async function registerForPush(uid: string): Promise<string | null> {
  if (!uid) return null;

  // --- Нативное приложение (Android) ---
  if (isNative()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== 'granted') {
        const req = await PushNotifications.requestPermissions();
        if (req.receive !== 'granted') return null;
      }
      // register() возвращает void — токен приходит событием 'registration'.
      let resolveToken: (t: string | null) => void = () => {};
      const tokenPromise = new Promise<string | null>((r) => { resolveToken = r; });
      const onReg = await PushNotifications.addListener('registration', (data) => {
        resolveToken(data.value);
      });
      const onErr = await PushNotifications.addListener('registrationError', (e) => {
        console.error('native push registrationError', e);
        resolveToken(null);
      });
      try {
        await PushNotifications.register();
        const token = await Promise.race([
          tokenPromise,
          new Promise<null>((r) => setTimeout(() => r(null), 15000)),
        ]);
        if (!token) return null;
        await saveToken(token, uid);
        return token;
      } finally {
        await onReg.remove();
        await onErr.remove();
      }
    } catch (e) {
      console.error('native push registration', e);
      return null;
    }
  }

  // --- Браузер ---
  if (!VAPID_KEY) return null;
  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return null;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return null;
    const token = await getToken(getMessaging(), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: await navigator.serviceWorker?.getRegistration(),
    });
    if (!token) return null;
    await saveToken(token, uid);
    return token;
  } catch (e) {
    console.error('web push registration', e);
    return null;
  }
}

/**
 * Просит серверную функцию отправить push указанным пользователям.
 * Вариант B: триггер живёт на клиенте — он сам дёргает функцию после
 * создания уведомления/сообщения. Отсюда же подтягиваются напоминания
 * о сроках сдачи.
 *
 * Ошибки не пробрасываем: неудачный push не должен ломать основное действие.
 */
export async function sendPushToUsers(
  uids: string[],
  payload: { title: string; body: string; data?: Record<string, string> }
): Promise<{ sent: number; failed: number }> {
  const targets = Array.from(new Set(uids.filter(Boolean)));
  if (!targets.length) return { sent: 0, failed: 0 };
  try {
    const res = await fetch(PUSH_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uids: targets, ...payload }),
    });
    if (!res.ok) throw new Error(`push-send ${res.status}`);
    return (await res.json()) as { sent: number; failed: number };
  } catch (e) {
    console.error('sendPushToUsers', e);
    return { sent: 0, failed: targets.length };
  }
}

/** Сколько у пользователя зарегистрировано устройств (для отладки). */
export async function countUserDevices(uid: string): Promise<number> {
  const snap = await getDocs(devicesRef);
  return snap.docs.filter((d) => (d.data() as DeviceToken).uid === uid).length;
}
