const ALLOWED_EXT = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'];
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_PROJECT_ZIP_BYTES = 1024 * 1024 * 1024; // 1 GB

const S3_HOST = 'https://s3.us.archive.org';
const METADATA_HOST = 'https://archive.org';
const COLLECTION = 'opensource_audio';
const META_POLL_MS = 10000;
const META_TIMEOUT_MS = 150000;
const META_ZIP_TIMEOUT_MS = 300000;

// LOW-ключи S3-аккаунта Archive.org. Светятся в бандле — для приложения
// рекомендуется отдельный «издательский» аккаунт archive.org.
// .trim(): секреты могут попасть в окружение с хвостовыми пробелами/переносами.
const ARCHIVE_ORG_ACCESS_KEY = (import.meta.env.VITE_ARCHIVE_ORG_ACCESS_KEY as string | undefined)?.trim();
const ARCHIVE_ORG_SECRET_KEY = (import.meta.env.VITE_ARCHIVE_ORG_SECRET_KEY as string | undefined)?.trim();

export function isBeatAudioFile(file: File): boolean {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ALLOWED_EXT.includes(ext) && (file.type.startsWith('audio/') || file.type === '');
}

export function checkBeatAudioFile(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return `Формат .${ext} не поддерживается (mp3/wav/ogg/m4a/aac/flac/opus)`;
  if (file.size > MAX_BYTES) return 'Файл больше 30 МБ';
  return null;
}

export function checkProjectZipFile(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext !== 'zip') return 'Формат .' + ext + ' не поддерживается, нужен .zip архив';
  if (file.size > MAX_PROJECT_ZIP_BYTES) return 'Архив больше 1 ГБ (максимум 1 ГБ)';
  if (file.size <= 0) return 'Пустой архив';
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Ждём, пока Archive.org проверит байты файла (bit-for-bit), опубликует айтем
// и файл появится в метаданных item. Публичный endpoint, авторизация не нужна.
async function metaReady(itemId: string, filename: string, timeoutMs = META_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${METADATA_HOST}/metadata/${itemId}`, {
        headers: { accept: 'application/json' },
      });
      if (r.ok) {
        const j = (await r.json()) as { files?: Array<{ name?: string }>; metadata?: { title?: string; mediatype?: string } };
        const files = Array.isArray(j.files) ? j.files : [];
        const hasFile = files.some((f) => f && f.name === filename);
        const meta = j.metadata || {};
        if (hasFile && meta.title && meta.mediatype) return true;
      }
    } catch {
      // запрос мог упасть — пробуем ещё раз
    }
    await sleep(META_POLL_MS);
  }
  return false;
}

/**
 * Общая загрузка файла в командный аккаунт Archive.org из браузера.
 * После PUT ждёт появления файла в метаданных и возвращает прямую ссылку.
 */
async function uploadArchiveFile(params: {
  file: File;
  itemPrefix: string;
  title: string;
  description?: string;
  creator?: string;
  mediatype: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ url: string; identifier: string; ready: boolean }> {
  if (!ARCHIVE_ORG_ACCESS_KEY || !ARCHIVE_ORG_SECRET_KEY) {
    throw new Error('Ключи Archive.org не настроены на сервере');
  }

  if (params.signal?.aborted) {
    throw new Error('Загрузка отменена');
  }

  const itemId = `${params.itemPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const ext = (params.file.name.split('.').pop() || '').toLowerCase();
  const base = (params.file.name.replace(/\.[^.]+$/, '') || params.itemPrefix)
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const filename = `${base || params.itemPrefix}-${Date.now().toString(36)}.${ext}`;

  const title = params.title.trim().slice(0, 200);
  if (!title) throw new Error('Укажите название');
  const description = (params.description || '').trim().slice(0, 1000);
  const creator = (params.creator || '').trim().slice(0, 200);

  const headers: Record<string, string> = {
    authorization: `LOW ${ARCHIVE_ORG_ACCESS_KEY}:${ARCHIVE_ORG_SECRET_KEY}`,
    'x-archive-auto-make-bucket': '1',
    'x-archive-queue-derive': '0',
    'x-archive-interactive-priority': '1',
    'x-archive-meta-mediatype': params.mediatype,
    'x-archive-meta01-collection': COLLECTION,
    'x-archive-meta-title': `uri(${encodeURIComponent(title)})`,
    'content-type': params.file.type || 'application/octet-stream',
  };
  if (description) headers['x-archive-meta-description'] = `uri(${encodeURIComponent(description)})`;
  if (creator) headers['x-archive-meta-creator'] = `uri(${encodeURIComponent(creator)})`;

    const put = await fetch(`${S3_HOST}/${itemId}/${filename}`, {
    method: 'PUT',
    headers,
    body: params.file,
    signal: params.signal,
  });
  let last = put;
  if (!put.ok) {
    const transient = [403, 429, 500, 502, 503, 504].includes(put.status);
    if (transient) {
      await sleep(2500);
      if (params.signal?.aborted) throw new Error('Загрузка отменена');
      for (let attempt = 0; attempt < 2; attempt++) {
        if (params.signal?.aborted) throw new Error('Загрузка отменена');
        last = await fetch(`${S3_HOST}/${itemId}/${filename}`, {
          method: 'PUT',
          headers,
          body: params.file,
          signal: params.signal,
        });
        if (last.ok) break;
        await sleep(attempt === 0 ? 5000 : 10000);
      }
    }
    if (!last.ok) {
      const detail = await last.text().catch(() => '');
      const code = (detail.match(/<Code>(.*?)<\/Code>/) || [])[1] || '';
      const snippet = code ? ` ${code}` : detail.replace(/\s+/g, ' ').trim().slice(0, 160);
      throw new Error(`Ошибка загрузки в Archive.org (${last.status}${snippet ? `: ${snippet}` : ''})`);
    }
  }

  const url = `https://archive.org/download/${itemId}/${filename}`;
  let ready = false;
  try {
    ready = await metaReady(itemId, filename, params.timeoutMs || META_TIMEOUT_MS);
  } catch {
    // не критично: ссылка всё равно скоро станет доступной
  }
  return { url, identifier: itemId, ready };
}

/**
 * Прямая загрузка mp3 в командный аккаунт Archive.org из браузера.
 * После PUT ждёт появления файла в метаданных и возвращает прямую ссылку.
 */
export async function uploadBeatAudio(params: {
  file: File;
  title: string;
  description?: string;
  creator?: string;
}): Promise<{ url: string; identifier: string; ready: boolean }> {
  return uploadArchiveFile({ ...params, itemPrefix: 'vtgbeat', mediatype: 'audio' });
}

/**
 * Загрузка .zip архива проекта трека (до 1 ГБ) в Archive.org.
 */
export async function uploadProjectZip(params: {
  file: File;
  title: string;
  description?: string;
  creator?: string;
  signal?: AbortSignal;
}): Promise<{ url: string; identifier: string; ready: boolean }> {
  const ext = (params.file.name.split('.').pop() || '').toLowerCase();
  if (ext !== 'zip') throw new Error('Проекты должны загружаться как .zip архивы');
  if (params.file.size > MAX_PROJECT_ZIP_BYTES) throw new Error('Архив больше 1 ГБ');
  return uploadArchiveFile({ ...params, itemPrefix: 'vtgproj', mediatype: 'zip', timeoutMs: META_ZIP_TIMEOUT_MS });
}

export interface PublishBeatCallbacks {
  onReady: (url: string) => void;
  onError: (message: string) => void;
}

/**
 * Фоновая публикация mp3 в Archive.org. Карточка уже сохранена (archiveStatus:
 * uploading) — здесь в фоне грузим файл, а когда появляется playable-ссылка,
 * вызываем onReady; при неудаче onError.
 * itemPrefix: 'vtgbeat' (биты) или 'vtgtrack' (треки) — по префиксу айтема
 * админ-панель раскладывает файлы хранилища по папкам.
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
      const prefix = params.itemPrefix === 'vtgtrack' ? 'vtgtrack' : 'vtgbeat';
      const { url } = await uploadArchiveFile({ ...params, itemPrefix: prefix, mediatype: 'audio' });
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
 * Фоновая публикация .zip проекта в Archive.org.
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
  const { signal } = params;
  if (signal?.aborted) {
    throw new Error('Загрузка отменена');
  }

  const { url } = await uploadProjectZip({
    file: params.file,
    title: params.title,
    description: params.description,
    creator: params.creator,
    signal,
  });

  params.callbacks.onReady(url);
  return { url };
}

/* ==========================================================================
   Хранилище аккаунта Archive.org (админ-панель, «проводник»)
   ========================================================================== */

export interface ArchiveItemBrief {
  identifier: string;
  title?: string;
  mediatype?: string;
  size?: number;
  addeddate?: string;
}

export interface ArchiveItemFile {
  name: string;
  size?: number;
  format?: string;
  source?: string;
}

/** Извлекает идентификатор айтема из ссылки вида https://archive.org/download/<id>/<file> */
export function extractItemIdFromUrl(url?: string): string | null {
  const m = /archive\.org\/(?:download|details)\/([^/?#]+)/i.exec((url || '').trim());
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Список айтемов, созданных дашбордом в аккаунте Archive.org (префикс vtg-).
 * Используется публичный поиск archive.org (advancedsearch, CORS разрешён).
 * Внимание: поиск индексируется с задержкой в несколько минут.
 */
export async function listAccountItems(): Promise<ArchiveItemBrief[]> {
  const q = 'identifier:(vtgbeat-* OR vtgtrack-* OR vtgproj-*)';
  const fl = ['identifier', 'title', 'mediatype', 'item_size', 'addeddate'];
  const url =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}` +
    fl.map((f) => `&fl%5B%5D=${f}`).join('') +
    '&rows=2000&output=json';
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Archive.org поиск недоступен (${r.status})`);
  const j = (await r.json()) as {
    response?: { docs?: Array<Record<string, any>> };
  };
  const docs = j.response?.docs || [];
  return docs.map((d) => ({
    identifier: String(d.identifier || ''),
    title: typeof d.title === 'string' ? d.title : Array.isArray(d.title) ? d.title[0] : undefined,
    mediatype: d.mediatype,
    size: typeof d.item_size === 'number' ? d.item_size : Number(d.item_size) || undefined,
    addeddate: d.addeddate,
  })).filter((x) => x.identifier);
}

/** Поиск любого айтема по точному идентификатору (в т.ч. загруженных вручную). */
export async function findItemByIdentifier(identifier: string): Promise<ArchiveItemBrief | null> {
  const id = identifier.trim();
  if (!id) return null;
  const r = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, {
    headers: { accept: 'application/json' },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { metadata?: Record<string, any>; files?: any[] };
  if (!j.metadata) return null;
  return {
    identifier: id,
    title: j.metadata.title,
    mediatype: j.metadata.mediatype,
    size: Number(j.metadata.item_size) || undefined,
  };
}

/** Файлы айтема через публичный metadata endpoint (без авторизации). */
export async function fetchItemFiles(identifier: string): Promise<ArchiveItemFile[]> {
  const r = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
    headers: { accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`Не удалось получить файлы айтема (${r.status})`);
  const j = (await r.json()) as { files?: Array<Record<string, any>> };
  const files = Array.isArray(j.files) ? j.files : [];
  return files
    .map((f) => ({
      name: String(f.name || ''),
      size: Number(f.size) || undefined,
      format: f.format,
      source: f.source,
    }))
    .filter((f) => f.name);
}

function s3AuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (!ARCHIVE_ORG_ACCESS_KEY || !ARCHIVE_ORG_SECRET_KEY) {
    throw new Error('Ключи Archive.org не настроены на сервере');
  }
  return {
    authorization: `LOW ${ARCHIVE_ORG_ACCESS_KEY}:${ARCHIVE_ORG_SECRET_KEY}`,
    ...extra,
  };
}

/** Удалить один файл из айтема Archive.org. */
export async function deleteArchiveFile(identifier: string, filename: string): Promise<void> {
  const r = await fetch(
    `${S3_HOST}/${encodeURIComponent(identifier)}/${filename.split('/').map(encodeURIComponent).join('/')}`,
    {
      method: 'DELETE',
      headers: s3AuthHeaders({ 'x-archive-keep-old-version': '0' }),
    }
  );
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`Не удалось удалить файл (${r.status}) ${detail.slice(0, 120)}`);
  }
}

/** Удалить айтем целиком: сначала каскадное удаление, при неудаче — по файлам. */
export async function deleteArchiveItem(identifier: string): Promise<void> {
  try {
    const r = await fetch(`${S3_HOST}/${encodeURIComponent(identifier)}/`, {
      method: 'DELETE',
      headers: s3AuthHeaders({ 'x-archive-cascade-delete': '1', 'x-archive-keep-old-version': '0' }),
    });
    if (r.ok) return;
  } catch {
    // падаем на ручное удаление файлов
  }
  const files = await fetchItemFiles(identifier);
  for (const f of files) {
    if (f.source && f.source !== 'original') continue; // производные удалятся сами
    await deleteArchiveFile(identifier, f.name);
  }
}