import type { PluginListenerHandle } from '@capacitor/core';
import { isNativeApp, platformName } from './platform';

/**
 * Скачивание APK и запуск системного установщика прямо из приложения.
 *
 * Всё работает только на Android:
 *  - `Filesystem.downloadFile` кладёт файл в кэш приложения, наружу ничего
 *    не пишется и разрешений на хранилище не нужно;
 *  - установщик запускает свой нативный плагин `ApkInstallerPlugin` (Intent
 *    ACTION_VIEW + FileProvider) — готовых npm-плагинов для этого нет,
 *    все попытки найти их (`@capacitor/intent`, `@capacitor-community/
 *    intent-launcher`) вернули 404;
 *  - iOS так обновляться не может в обход App Store, поэтому там эта
 *    функция не вызывается вовсе.
 *
 * `@capacitor/filesystem` и `@capacitor/core` подгружаются динамически,
 * чтобы веб-сборка не тащила за собой мобильные плагины.
 */

/** Файл в кэше, в который пишется новая версия. Перезаписывается при каждом обновлении. */
const APK_FILE_NAME = 'vtg-dashboard-update.apk';

/** Где мы находимся: качаем файл или уже открыли установщик. */
export type ApkUpdatePhase = 'downloading' | 'installing';

export interface ApkUpdateStatus {
  phase: ApkUpdatePhase;
  /** Целые проценты загрузки, 0–99. На фазе `installing` всегда 100. */
  percent: number;
}

/**
 * Свой нативный плагин (`ApkInstallerPlugin.java`), зарегистрированный в
 * `MainActivity.java`. Стандартного аналога в @capacitor/* нет, поэтому
 * типы описываем сами — это типичный способ подключить самописный плагин.
 */
interface ApkInstallerApi {
  install(options: { path: string }): Promise<{ path: string }>;
}

// `registerPlugin` должен вызываться один раз: результат кэшируем, иначе
// каждый вызов создавал бы новую прокси-обёртку.
let installerPromise: Promise<ApkInstallerApi> | null = null;

function getInstaller(): Promise<ApkInstallerApi> {
  if (!installerPromise) {
    installerPromise = import('@capacitor/core').then(({ registerPlugin }) =>
      registerPlugin<ApkInstallerApi>('ApkInstaller'),
    );
  }
  return installerPromise;
}

/** Техническая причина уходит в консоль, пользователю — короткая фраза по-русски. */
function fail(userMessage: string, cause: unknown, logLabel: string): never {
  console.warn(`[apkUpdate] ${logLabel}:`, cause);
  throw new Error(userMessage);
}

/**
 * Качает APK и открывает системный установщик.
 *
 * Бросает `Error` с сообщением, пригодным для показа в плашке. Прогресс и
 * смена фазы приходят в `onStatus` — без него функция работает так же,
 * просто плашка не показывает проценты.
 *
 * @param apkUrl прямая ссылка на APK (app-meta.json)
 * @param onStatus колбэк прогресса, вызывается много раз подряд
 */
export async function downloadAndInstallApk(
  apkUrl: string,
  onStatus?: (status: ApkUpdateStatus) => void,
): Promise<void> {
  if (!isNativeApp() || platformName() !== 'android') {
    throw new Error('Обновление доступно только в Android-приложении.');
  }

  const [{ Directory, Filesystem }] = await Promise.all([import('@capacitor/filesystem')]);

  // Прогресс придёт только если слушатель уже подписан до старта загрузки.
  let listener: PluginListenerHandle | null = null;
  try {
    listener = await Filesystem.addListener('progress', ({ bytes, contentLength }) => {
      // Без contentLength (сервер не отдал длину) проценты посчитать нельзя.
      if (!contentLength) return;
      const percent = Math.round((bytes / contentLength) * 100);
      onStatus?.({ phase: 'downloading', percent: Math.max(0, Math.min(99, percent)) });
    });
  } catch (e) {
    // Прогресс — приятная мелочь; загрузка без него всё равно идёт.
    console.warn('[apkUpdate] не удалось подписаться на прогресс:', e);
  }

  onStatus?.({ phase: 'downloading', percent: 0 });

  let path: string | undefined;
  try {
    ({ path } = await Filesystem.downloadFile({
      url: apkUrl,
      path: APK_FILE_NAME,
      directory: Directory.Cache,
      progress: true,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/timeout|timed out|connection|connect|unable to resolve|network/i.test(msg)) {
      fail('Не удалось скачать обновление — проверьте подключение к интернету.', e, 'загрузка');
    }
    fail('Не удалось скачать обновление.', e, 'загрузка');
  } finally {
    // Слушатель снимаем в любом случае: он слышит ВСЕ события 'progress',
    // и оставленный висеть он примешался бы к следующей загрузке.
    await listener?.remove().catch(() => undefined);
  }

  if (!path) {
    throw new Error('Не удалось скачать обновление — файл не получен.');
  }

  onStatus?.({ phase: 'installing', percent: 100 });

  try {
    await getInstaller().then((plugin) => plugin.install({ path }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/security|permission|unable to start/i.test(msg)) {
      fail(
        'Android не разрешил установку. Разрешите установку из этого источника в настройках и повторите.',
        e,
        'установка',
      );
    }
    fail('Не удалось запустить установщик обновления.', e, 'установка');
  }
}
