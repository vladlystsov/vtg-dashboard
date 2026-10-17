/**
 * Отправка push-уведомлений через Firebase Cloud Messaging.
 *
 * Вариант B (без Cloud Functions): триггер живёт на клиенте — после
 * создания уведомления/сообщения приложение само дёргает эту функцию.
 * Функция находит токены получателей в коллекции `devices` и шлёт FCM.
 *
 * Переменные окружения (Vercel, без префикса VITE_):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   либо сервис-аккаунт целиком в FIREBASE_SERVICE_ACCOUNT (JSON-строка).
 *   FIREBASE_API_KEY (или VITE_FIREBASE_API_KEY) — для проверки ID-токена.
 *
 * POST /api/push-send  (Authorization: Bearer <Firebase ID-токен>)
 *   { uids: string[], title: string, body: string, data?: object }
 * → { sent, failed, total }
 *
 * Авторизация обязательна: иначе это открытый релей, которым можно слать
 * уведомления любому пользователю, зная его uid. Проверка роли здесь не
 * нужна — отправлять рассылку имеет право любой, кто может создать
 * уведомление, то есть любой авторизованный участник команды.
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
}

function firebaseEnv() {
  return {
    apiKey: (process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '').trim(),
    projectId: (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  };
}

/** Firebase ID-токен из заголовка Authorization → { uid, email } или null. */
async function verifyAuth(idToken) {
  const { apiKey } = firebaseEnv();
  if (!idToken || !apiKey) return null;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const u = j && j.users && j.users[0];
    return u ? { uid: u.localId, email: u.email || '' } : null;
  } catch {
    return null;
  }
}

function getFirebaseApp() {
  if (getApps().length) return getApps()[0];

  // Приоритет 1: готовый JSON сервис-аккаунта одной переменной.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const json = JSON.parse(raw);
    // Vercel хранит \n буквально — превращаем в переносы строк.
    if (typeof json.private_key === 'string') {
      json.private_key = json.private_key.replace(/\\n/g, '\n');
    }
    return initializeApp({ credential: cert(json) });
  }

  // Приоритет 2: отдельные переменные (удобнее в UI Vercel).
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Не заданы учётные данные Firebase Admin: нужны FIREBASE_SERVICE_ACCOUNT ' +
      'или FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.'
    );
  }
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }),
  });
}

/** Читает Firestore через Admin SDK (getFirestore подтянется лениво). */
async function tokensForUids(uids) {
  const app = getFirebaseApp();
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore(app);

  // devices — небольшая коллекция (по записи на устройство), поэтому
  // читаем её целиком и фильтруем в памяти, а не делаем N запросов.
  const snap = await db.collection('devices').get();
  const wanted = new Set(uids);
  const tokens = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (wanted.has(data.uid) && typeof data.token === 'string' && data.token) {
      tokens.push(data.token);
    }
  }
  return tokens;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });

  // Только Firebase ID-токен: анонимная рассылка не принимается.
  if (!firebaseEnv().apiKey) {
    return res.status(500).json({ error: 'Функция не настроена: нет FIREBASE_API_KEY / VITE_FIREBASE_API_KEY' });
  }
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = await verifyAuth(idToken);
  if (!user) {
    return res.status(401).json({ error: 'Требуется вход в аккаунт' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }
  }

  const uids = Array.isArray(body?.uids) ? body.uids.filter(Boolean) : [];
  const title = String(body?.title || '').trim();
  const text = String(body?.body || '').trim();
  if (!uids.length || !title || !text) {
    return res.status(400).json({ error: 'Нужны uids, title и body' });
  }

  let tokens = [];
  try {
    tokens = await tokensForUids(uids);
  } catch (e) {
    console.error('push-send: не удалось прочитать devices', e);
    return res.status(500).json({ error: 'Не удалось получить токены устройств' });
  }

  if (!tokens.length) {
    // Нет зарегистрированных устройств — это не ошибка: приложение могло
    // ещё ни разу не открыться на телефоне.
    return res.status(200).json({ sent: 0, failed: 0, total: uids.length, tokens: 0 });
  }

  try {
    const messaging = getMessaging(getFirebaseApp());
    const result = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body: text },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          // Не « сворачивать-разворачивать » баннер при каждом пуше.
          // Цвет берём из акцента приложения (красный).
          color: '#8f1c1c',
        },
      },
      data: body?.data && typeof body.data === 'object' ? body.data : {},
    });

    const failed = result.responses.filter((r) => !r.success).length;
    return res.status(200).json({
      sent: result.successCount,
      failed,
      total: tokens.length,
    });
  } catch (e) {
    console.error('push-send: отправка не удалась', e);
    return res.status(500).json({ error: 'FCM недоступен: ' + (e?.message || 'ошибка') });
  }
}