import type { PluginListenerHandle } from '@capacitor/core';
import { isNativeApp, platformName } from './platform';

/**
 * Сохранение файла по ссылке в публичную папку «Загрузки».
 *
 * Нужно только Android-приложению. В браузере и в WebView атрибут `download`
 * у ссылки не срабатывает — Android WebView его игнорирует, а нажатие молча
 * ничего не делает. Поэтому нативная часть качает файл сама и кладёт его в
 * «Загрузки» через MediaStore (плагин `FileSaverPlugin.java`).
 *
 * На iOS и в вебе этот модуль не вызывается: там файл скачивается обычной
 * ссылкой с атрибутом `download`, и подменять это нечем.
 */

/** Стабильный идентификатор прогресса: нативные прогресс-слушатели общие у всех плагинов. */
const PROGRESS_EVENT = 'progress';

export interface SaveToDownloadsOptions {
  url: string;
  /** Имя файла с расширением. Пусто — плагин возьмёт имя из URL. */
  fileName?: string;
  mimeType?: string;
}

export interface SaveToDownloadsResult {
  /** Имя сохранённого файла (может отличаться, если с таким именем уже был файл). */
  fileName: string;
  /** Человекочитаемое место: «Download/имя.файл» либо абсолютный путь. */
  location: string;
}

export type SaveProgress = { percent: number };

/**
 * Свой нативный плагин (`FileSaverPlugin.java`), зарегистрированный в
 * `MainActivity.java`. Стандартного аналога в @capacitor/* нет: Filesystem
 * умеет писать только внутрь приватных папок приложения, оттуда файл в
 * «Загрузки» пользователь не достанет.
 */
interface FileSaverApi {
  saveToDownloads(options: SaveToDownloadsOptions): Promise<SaveToDownloadsResult>;
  cancel(): Promise<void>;
  addListener(
    eventName: string,
    listenerFunc: (data: { bytes: number; contentLength: number }) => void,
  ): Promise<PluginListenerHandle>;
}

/** Отмена — не ошибка: интерфейс не должен показывать её как сбой загрузки. */
export class SaveCancelledError extends Error {
  constructor() {
    super('Загрузка отменена');
    this.name = 'SaveCancelledError';
  }
}

/** true, только если файл можно сохранить средствами приложения (Android). */
export function canSaveNatively(): boolean {
  return isNativeApp() && platformName() === 'android';
}

// registerPlugin должен вызываться один раз: результат кэшируем, иначе каждый
// вызов создавал бы новую прокси-обёртку.
let saverPromise: Promise<FileSaverApi> | null = null;

function getSaver(): Promise<FileSaverApi> {
  if (!saverPromise) {
    saverPromise = import('@capacitor/core').then(({ registerPlugin }) =>
      registerPlugin<FileSaverApi>('FileSaver'),
    );
  }
  return saverPromise;
}

/** Скачивает файл и сохраняет его в «Загрузки». Бросает Error с текстом для показа. */
export async function saveToDownloads(
  options: SaveToDownloadsOptions,
  onProgress?: (progress: SaveProgress) => void,
): Promise<SaveToDownloadsResult> {
  if (!canSaveNatively()) {
    throw new Error('Сохранение в «Загрузки» доступно только в Android-приложении.');
  }
  const saver = await getSaver();

  // Слушатель должен быть подписан до старта загрузки, иначе первые
  // проценты пройдут мимо него.
  let listener: PluginListenerHandle | null = null;
  try {
    listener = await saver.addListener(PROGRESS_EVENT, ({ bytes, contentLength }) => {
      // Без contentLength (сервер не отдал длину) проценты посчитать нельзя.
      if (!contentLength) return;
      const percent = Math.round((bytes / contentLength) * 100);
      onProgress?.({ percent: Math.max(0, Math.min(99, percent)) });
    });
  } catch (e) {
    // Прогресс — приятная мелочь; сохранение без него всё равно идёт.
    console.warn('[fileSaver] не удалось подписаться на прогресс:', e);
  }

  try {
    return await saver.saveToDownloads(options);
  } catch (e) {
    // Код CANCELLED ставит плагин, когда пользователь нажал на крестик:
    // это не сбой, и показывать ошибку не нужно.
    if ((e as { code?: string } | null)?.code === 'CANCELLED') {
      throw new SaveCancelledError();
    }
    const msg = e instanceof Error ? e.message : '';
    if (/timeout|timed out|connection|connect|unable to resolve|network|host/i.test(msg)) {
      throw new Error('Не удалось скачать файл — проверьте подключение к интернету.');
    }
    throw new Error(e instanceof Error && e.message ? e.message : 'Не удалось сохранить файл.');
  } finally {
    // Снимаем в любом случае: иначе следующая загрузка начнёт считать
    // проценты по двум потокам сразу.
    await listener?.remove().catch(() => undefined);
  }
}

/**
 * Прерывает текущее сохранение. Плагин останавливает поток и удаляет
 * недописанный файл, поэтому в «Загрузках» не остаётся обрывка.
 */
export async function cancelSave(): Promise<void> {
  if (!canSaveNatively()) return;
  try {
    const saver = await getSaver();
    await saver.cancel();
  } catch {
    // Отменять нечего — молча выходим.
  }
}