/**
 * Хранилище файлов на Backblaze B2 (замена Firebase Storage / Archive.org).
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
import { checkBeatAudioFile, checkProjectZipFile } from './archiveService';
export { checkBeatAudioFile, checkProjectZipFile };

// Прокси-функция хранилища: по умолчанию тот же origin (SPA на Vercel),
// для GitHub Pages задайте VITE_B2_PROXY_URL — полный URL api/b2-storage.
const API_URL = (import.meta.env.VITE_B2_PROXY_URL as string | undefined)?.trim() || '/api/b2-storage';

const FOLDER_TRACKS = 'tracks';
const FOLDER_BEATS = 'beats';
const FOLDER_PROJECTS = 'projects';

export interface PublishBeatCallbacks {
  onReady: (url: string) => void;
  onError: (message: string) => void;
}

async function callApi(op: string, extra: Record<string, unknown> = {}): Promise<any> {
  const user = auth.currentUser;
  if (!user) throw new Error('Требуется вход в аккаунт');
  const idToken = await user.getIdToken();
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ op, ...extra }),
    });
  } catch {
    throw new Error('Хранилище недоступно (сеть или прокси-функция)');
  }
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error((j && (j.error as string)) || `Ошибка хранилища (${res.status})`);
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
  const { url, publicUrl } = await callApi('upload-url', { path });
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
  if (!res.ok) throw new Error(`Ошибка загрузки в хранилище (${res.status})`);
  return publicUrl;
}

// === PUBLISH ===

/**
 * Фоновая публикация mp3 (биты/треки) в Backblaze B2. Карточка уже сохранена
 * (archiveStatus: uploading) — здесь в фоне грузим файл и вызываем onReady,
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

/** Удалить файл по пути в бакете (серверная операция с ключами). */
export async function deleteStorageFile(path: string): Promise<void> {
  await callApi('delete', { path });
}

/** Удалить файл по ссылке (игнорирует ссылки не из нашего хранилища, напр. Archive.org). */
export async function deleteStorageFileByUrl(url: string): Promise<void> {
  const path = storagePathFromUrl(url);
  if (!path) return;
  await deleteStorageFile(path);
}

/** Список всех файлов бакета (с размерами и публичными ссылками). */
export async function listStorageFiles(): Promise<StorageItem[]> {
  const { items } = await callApi('list');
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