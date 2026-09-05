const ALLOWED_EXT = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'];
const MAX_BYTES = 30 * 1024 * 1024;

const S3_HOST = 'https://s3.us.archive.org';
const METADATA_HOST = 'https://archive.org';
const COLLECTION = 'opensource_audio';
const META_POLL_MS = 10000;
const META_TIMEOUT_MS = 150000;

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
 * Прямая загрузка mp3 в командный аккаунт Archive.org из браузера.
 * После PUT ждёт появления файла в метаданных и возвращает прямую ссылку.
 */
export async function uploadBeatAudio(params: {
  file: File;
  title: string;
  description?: string;
  creator?: string;
}): Promise<{ url: string; identifier: string; ready: boolean }> {
  if (!ARCHIVE_ORG_ACCESS_KEY || !ARCHIVE_ORG_SECRET_KEY) {
    throw new Error('Ключи Archive.org не настроены на сервере');
  }

  const itemId = `vtgbeat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const ext = (params.file.name.split('.').pop() || '').toLowerCase();
  const extOk = ALLOWED_EXT.includes(ext) ? ext : 'mp3';
  const base = (params.file.name.replace(/\.[^.]+$/, '') || 'beat')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const filename = `${base || 'beat'}-${Date.now().toString(36)}.${extOk}`;

  const title = params.title.trim().slice(0, 200);
  if (!title) throw new Error('Укажите название бита');
  const description = (params.description || '').trim().slice(0, 1000);
  const creator = (params.creator || '').trim().slice(0, 200);

  const headers: Record<string, string> = {
    authorization: `LOW ${ARCHIVE_ORG_ACCESS_KEY}:${ARCHIVE_ORG_SECRET_KEY}`,
    'x-archive-auto-make-bucket': '1',
    'x-archive-queue-derive': '0',
    'x-archive-interactive-priority': '1',
    'x-archive-meta-mediatype': 'audio',
    'x-archive-meta01-collection': COLLECTION,
    'x-archive-meta-title': `uri(${encodeURIComponent(title)})`,
    'content-type': params.file.type || 'audio/mpeg',
  };
  if (description) headers['x-archive-meta-description'] = `uri(${encodeURIComponent(description)})`;
  if (creator) headers['x-archive-meta-creator'] = `uri(${encodeURIComponent(creator)})`;

  const put = await fetch(`${S3_HOST}/${itemId}/${filename}`, {
    method: 'PUT',
    headers,
    body: params.file,
  });
  let last = put;
  if (!put.ok) {
    // archive.org редко отдаёт 403/429/5xx транзитно (лимиты, обслуживание) — пробуем ещё пару раз
    const transient = [403, 429, 500, 502, 503, 504].includes(put.status);
    if (transient) {
      await sleep(2500);
      for (let attempt = 0; attempt < 2; attempt++) {
        last = await fetch(`${S3_HOST}/${itemId}/${filename}`, {
          method: 'PUT',
          headers,
          body: params.file,
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
    ready = await metaReady(itemId, filename);
  } catch {
    // не критично: ссылка всё равно скоро станет доступной
  }
  return { url, identifier: itemId, ready };
}