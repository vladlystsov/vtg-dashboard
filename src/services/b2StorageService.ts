/**
 * Хранилище файлов на Backblaze B2.
 *
 * Схема: ключи B2 живут только в serverless-функции (api/b2-storage.mjs).
 * Браузер запрашивает у функции presigned PUT URL и льёт файл напрямую в B2 —
 * гигабайтные zip не проходят через serverless и не упираются в лимиты тела.
 * Файлы лежат в публичном бакете под неугадываемыми именами: постоянные
 * ссылки для плеера (как токен-ссылки Firebase раньше), но не индексируются.
 * Функция проверяет Firebase ID-токен и роль: загрузка — админы/битмейкеры,
 * удаление и список — админы.
 */

import { auth } from '../config/firebase';

// Валидаторы файлов общие (форматы и лимиты не менялись)
import { checkBeatAudioFile, checkProjectZipFile } from './fileValidation';
export { checkBeatAudioFile, checkProjectZipFile };

// Прокси хранилища. По умолчанию — Cloudflare Workers: адреса *.vercel.app из
// части сетей недоступны (диапазоны 64.29.17.0/24 и 216.198.79.0/24 не
// отвечают), из-за чего загрузка файлов зависала. Дефолт зашит, чтобы сборка
// работала и без переменной (локальный `npm run cap:apk` без .env, веб под
// GitHub Pages без секрета CI). Относительный '/api/b2-storage' вне
// Vercel-хостинга нигде не существует: в нативном приложении это
// capacitor://localhost/api/..., который всегда падает с «Хранилище
// недоступно». Заданное вручную VITE_B2_PROXY_URL имеет приоритет.
const API_URL =
  (import.meta.env.VITE_B2_PROXY_URL as string | undefined)?.trim() ||
  'https://vtg-b2-storage.vtg-dashboard.workers.dev';

// Мобильная сеть любит «глотать» первый запрос: DNS отдал адрес, а соединение
// не устанавливается. Одно долгое ожидание в такой ситуации бесполезно —
// вместо него делаем несколько КОРОТКИХ попыток: каждая перерезолвит DNS и с
// высокой вероятностью попадёт на живой адрес. Суммарное ожидание примерно
// то же, но успеха намного больше.
const API_TIMEOUT_MS = 7000;
const API_RETRIES = 3; // 4 попытки по 7 с ≈ 28 с в худшем случае
const API_RETRY_PAUSE_MS = 400;

const FOLDER_TRACKS = 'tracks';
const FOLDER_BEATS = 'beats';
const FOLDER_PROJECTS = 'projects';

export interface PublishBeatCallbacks {
  onReady: (url: string) => void;
  onError: (message: string) => void;
}

/**
 * Сигнал запроса: таймаут плюс (если передан) отмена пользователем.
 *
 * Раньше отмена доходила только до загрузки файла, а функция выдачи ссылки
 * (op=upload-url) жила на своём таймауте. Когда она зависала (прокси на
 * недоступном адресе), нажатие «Отменить» не прерывало запрос, карточка
 * оставалась со спиннером, а кнопка — в состоянии «Отменяем…».
 */
function requestSignal(userSignal?: AbortSignal): AbortSignal {
  if (!userSignal) return AbortSignal.timeout(API_TIMEOUT_MS);
  if (userSignal.aborted) {
    const already = new AbortController();
    already.abort(userSignal.reason);
    return already.signal;
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('timeout', 'TimeoutError')),
    API_TIMEOUT_MS
  );
  userSignal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
      controller.abort(userSignal.reason);
    },
    { once: true }
  );
  return controller.signal;
}

async function callApi(
  op: string,
  extra: Record<string, unknown> = {},
  userSignal?: AbortSignal
): Promise<any> {
  const user = auth.currentUser;
  if (!user) throw new Error('Требуется вход в аккаунт');
  const idToken = await user.getIdToken();
  let res: Response | null = null;
  let timedOutAttempts = 0;
  for (let attempt = 0; attempt <= API_RETRIES; attempt++) {
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ op, ...extra }),
        signal: requestSignal(userSignal),
      });
      break;
    } catch (e) {
      if (userSignal?.aborted) {
        throw new Error('Загрузка отменена');
      }
      if ((e as Error)?.name === 'AbortError' && userSignal) throw new Error('Загрузка отменена');
      // Явная отмена повтору не подлежит; таймаут и обрыв сети пробуем
      // ещё раз — ниже сообщение говорит, что именно произошло.
      if ((e as Error)?.name === 'AbortError') throw new Error('Запрос к хранилищу отменён');
      if ((e as Error)?.name === 'TimeoutError') timedOutAttempts++;
      if (attempt < API_RETRIES) {
        // Пауза, чтобы успела смениться выбранная DNS-запись.
        await new Promise((r) => setTimeout(r, API_RETRY_PAUSE_MS));
      }
    }
  }
  if (!res) {
    const total = (API_TIMEOUT_MS * (API_RETRIES + 1)) / 1000;
    throw new Error(
      timedOutAttempts > 0
        ? `Хранилище не отвечает: ${timedOutAttempts} из ${API_RETRIES + 1} попыток по ` +
          `${API_TIMEOUT_MS / 1000} с не получили ответа (ждали до ${total} с). Адрес: ${API_URL}. ` +
          `Проверьте, открывается ли он в браузере.`
        : `Хранилище недоступно (сеть или прокси-функция): ${API_URL}`
    );
  }
  // Тело читаем текстом: res.json() бросает на не-JSON (HTML-заглушка Vercel,
  // пустой ответ), а .catch(() => null) молча отдавал null наружу — вызывающий
  // код падал с «Cannot destructure property 'items' … as it is null».
  const raw = await res.text().catch(() => '');
  let j: any = null;
  try {
    j = raw ? JSON.parse(raw) : null;
  } catch {
    j = null;
  }
  if (!res.ok) {
    const serverMsg = j && typeof j.error === 'string' ? j.error : '';
    throw new Error(serverMsg || `Ошибка хранилища (${res.status})${raw ? `: ${raw.slice(0, 120)}` : ''}`);
  }
  if (j === null) {
    throw new Error(
      `Прокси-функция хранилища вернула не-JSON (${res.status} ${res.statusText || ''}). ` +
      `Обычно это HTML-заглушка хостинга вместо ответа функции: ${API_URL}`
    );
  }
  return j;
}

/** Путь в бакете: <папка>/<очищенное имя>-<суффикс>.<ext> */
function buildStoragePath(folder: string, title: string, originalName: string): string {
  const ext = (originalName.split('.').pop() || 'bin').toLowerCase();
  const base = (title || originalName.replace(/\.[^.]+$/, '') || folder)
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 80);
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return `${folder}/${base || 'file'}-${unique}.${ext}`;
}

/** Presigned PUT: файл льётся из браузера напрямую в B2, минуя serverless. */
async function uploadFile(path: string, file: File, signal?: AbortSignal): Promise<string> {
  // Сигнал пользователя прокидываем и сюда: без этого отмена не действует,
  // пока запрос висит на выдаче ссылки (op=upload-url).
  const resp = await callApi('upload-url', { path }, signal);
  const url = resp && typeof resp.url === 'string' ? resp.url : '';
  if (!url) {
    throw new Error('Прокси-функция не вернула ссылку для загрузки (нет поля url)');
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PUT',
      body: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError' || signal?.aborted) throw new Error('Загрузка отменена');
    throw e;
  }
  if (!res.ok) {
    if (res.status === 405 || res.status === 403) {
      throw new Error(
        `Ошибка загрузки в хранилище (${res.status}). Проверьте CORS-правила бакета Backblaze B2: ` +
        `для прямых загрузок из браузера в бакете должны быть разрешены методы PUT/OPTIONS/HEAD и заголовок content-type.`
      );
    }
    throw new Error(`Ошибка загрузки в хранилище (${res.status})`);
  }
  return typeof resp.publicUrl === 'string' && resp.publicUrl ? resp.publicUrl : url;
}

// === PUBLISH ===

/**
 * Фоновая публикация mp3 (биты/треки) в Backblaze B2. Карточка уже сохранена
 * (uploadStatus: uploading) — здесь в фоне грузим файл и вызываем onReady,
 * когда появляется playable-ссылка; при неудаче onError.
 * itemPrefix: 'vtgtrack' (треки) или 'vtgbeat' (биты) — по нему выбирается папка.
 */
export function publishBeatAudioInBackground(params: {
  file: File;
  title: string;
  description?: string;
  creator?: string;
  itemPrefix?: string;
  callbacks: PublishBeatCallbacks;
  signal?: AbortSignal;
}): void {
  (async () => {
    try {
      if (params.signal?.aborted) {
        throw new Error('Загрузка отменена');
      }
      const folder = params.itemPrefix === 'vtgtrack' ? FOLDER_TRACKS : FOLDER_BEATS;
      const path = buildStoragePath(folder, params.title, params.file.name);
      const url = await uploadFile(path, params.file, params.signal);
      params.callbacks.onReady(url);
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.message === 'Загрузка отменена') {
        params.callbacks.onError('Загрузка отменена');
      } else {
        params.callbacks.onError(e instanceof Error ? e.message : 'Ошибка публикации');
      }
    }
  })();
}

/**
 * Загрузка .zip архива проекта трека (до 1 ГБ) в Backblaze B2.
 * signal: AbortController.signal — для отмены загрузки.
 */
export async function uploadProjectZip(params: {
  file: File;
  title: string;
  description?: string;
  creator?: string;
  signal?: AbortSignal;
}): Promise<{ url: string; path: string }> {
  const err = checkProjectZipFile(params.file);
  if (err) throw new Error(err);
  const path = buildStoragePath(FOLDER_PROJECTS, params.title, params.file.name);
  const url = await uploadFile(path, params.file, params.signal);
  return { url, path };
}

/**
 * Фоновая публикация .zip проекта в Backblaze B2.
 * signal: AbortController.signal — для отмены загрузки.
 */
export async function publishProjectZipInBackground(params: {
  file: File;
  title: string;
  description?: string;
  creator?: string;
  callbacks: PublishBeatCallbacks;
  signal?: AbortSignal;
}): Promise<{ url: string }> {
  if (params.signal?.aborted) {
    throw new Error('Загрузка отменена');
  }
  const { url } = await uploadProjectZip({
    file: params.file,
    title: params.title,
    description: params.description,
    creator: params.creator,
    signal: params.signal,
  });
  params.callbacks.onReady(url);
  return { url };
}

/* ==========================================================================
   Управление файлами хранилища (админ-панель, «проводник»)
   ========================================================================== */

export type StorageFolder = 'beats' | 'tracks' | 'projects' | 'covers' | 'other';

export interface StorageItem {
  /** Полный путь в бакете (уникальный ключ). */
  path: string;
  /** Имя файла. */
  name: string;
  size: number;
  updated?: string;
  folder: StorageFolder;
  /** Постоянная публичная ссылка (бакет публичный, имя неугадываемое). */
  publicUrl?: string;
}

function folderOf(path: string): StorageFolder {
  const first = path.split('/')[0];
  if (first === 'beats' || first === 'tracks' || first === 'projects' || first === 'covers') return first;
  return 'other';
}

/** Извлекает путь из публичной ссылки B2 (для сопоставления с карточками). */
export function storagePathFromUrl(url: string): string | null {
  const u = (url || '').trim();
  if (!u) return null;
  // Ссылка-функция: /api/b2-storage?path=<путь> (302 → presigned GET)
  const fn = /[?&]path=([^&]+)/.exec(u);
  if (fn) {
    try {
      return decodeURIComponent(fn[1]);
    } catch {
      return fn[1];
    }
  }
  // Дружественный URL B2: https://fXXX.backblazeb2.com/file/<bucket>/<path>
  const m = /backblazeb2\.com\/file\/[^/]+\/(.+)$/i.exec(u);
  if (m) return m[1];
  const base = (import.meta.env.VITE_B2_PUBLIC_BASE as string | undefined)?.trim();
  if (base) {
    const b = base.replace(/\/+$/, '');
    if (u.startsWith(`${b}/`)) return u.slice(b.length + 1);
  }
  return null;
}

/**
 * Приводит ссылку хранилища к текущему прокси.
 *
 * Ссылки на файлы сохраняются в Firestore как абсолютные адреса, поэтому
 * после переезда прокси на другой домен старые записи продолжали бы ходить
 * на прежний (Vercel) адрес, который из части сетей недоступен. Такие ссылки
 * переписываем на лету: путь из `?path=` переносим на актуальный API_URL.
 *
 * Ссылки не из хранилища (SoundCloud, YouTube, прямой B2) не трогаем —
 * без `?path=` функция возвращает адрес как есть.
 */
export function resolveStorageUrl(url?: string | null): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  const fn = /[?&]path=([^&]+)/.exec(raw);
  if (!fn) return raw;
  return `${API_URL}?path=${fn[1]}`;
}

/**
 * Переписывает ссылки хранилища в указанных полях записи.
 * Нестроковые и пустые значения не трогает и новых ключей не создаёт.
 */
export function resolveStorageUrls<T extends object>(item: T, fields: readonly (keyof T)[]): T {
  const next = { ...item } as Record<string, unknown>;
  for (const field of fields) {
    const value = next[field as string];
    if (typeof value === 'string') next[field as string] = resolveStorageUrl(value);
  }
  return next as T;
}

/** Удалить файл по пути в бакете (серверная операция с ключами). */
export async function deleteStorageFile(path: string): Promise<void> {
  await callApi('delete', { path });
}

/** Удалить файл по ссылке (игнорирует ссылки не из нашего хранилища). */
export async function deleteStorageFileByUrl(url: string): Promise<void> {
  const path = storagePathFromUrl(url);
  if (!path) return;
  await deleteStorageFile(path);
}

/** Список всех файлов бакета (с размерами и публичными ссылками). */
export async function listStorageFiles(): Promise<StorageItem[]> {
  const resp = await callApi('list');
  const items = resp && Array.isArray(resp.items) ? resp.items : null;
  if (!items) {
    // Раньше здесь стояла деструктуризация `const { items } = await callApi(...)`:
    // если функция отвечала не-JSON, приходил null и падало с
    // «Cannot destructure property 'items' … as it is null» — без понятной причины.
    throw new Error('Прокси-функция не вернула список файлов (нет поля items)');
  }
  return (items as Array<{ path: string; name: string; size: number; updated?: string; publicUrl?: string }>).map((it) => ({
    path: it.path,
    name: it.name,
    size: Number(it.size) || 0,
    updated: it.updated,
    publicUrl: it.publicUrl,
    folder: folderOf(it.path),
  }));
}

/** Сколько места занято в бакете (сумма размеров + число файлов). */
export async function fetchStorageUsage(): Promise<{ usedBytes: number; fileCount: number }> {
  const files = await listStorageFiles();
  return {
    usedBytes: files.reduce((s, f) => s + (f.size || 0), 0),
    fileCount: files.length,
  };
}