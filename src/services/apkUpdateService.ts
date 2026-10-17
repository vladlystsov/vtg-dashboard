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
  install(options: { path: string }): Promise<{ path: string; launched?: boolean }>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
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
 * Отличаем «нужно разрешение на установку» от прочих ошибок: этот случай
 * лечится кнопкой в плашке (см. NewsBanner), а не повторной попыткой.
 */
function isUnknownSourcesError(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  if (code === 'NEEDS_UNKNOWN_SOURCES') return true;
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /unknown|неизвестн|разрешени.*источник/i.test(msg);
}

/** Открывает экран настроек, где разрешают установку из этого источника. */
export async function openInstallSettings(): Promise<void> {
  await getInstaller().then((plugin) => plugin.openInstallSettings());
}

/**
 * Разрешено ли приложению запускать установщик (на Android 8+ без этого
 * разрешения установщик может не открыться вовсе).
 *
 * На вебе и на старых APK без метода `canInstall` считаем, что разрешено:
 * проверка не должна мешать обновлению там, где её не о чем делать.
 */
export async function isInstallAllowed(): Promise<boolean> {
  try {
    const { allowed } = await getInstaller().then((plugin) => plugin.canInstall());
    return allowed !== false;
  } catch {
    return true;
  }
}

// Сколько ждём ответа нативного install(), пока не решим, что установщик
// уже открыт. Раньше такого ожидания не было: при уходе приложения в фон
// ответ моста мог не дойти, и плашка навсегда зависала на «Запуск
// установщика…».
const INSTALL_ACK_TIMEOUT_MS = 10000;

/**
 * Качает APK и открывает системный установщик.
 *
 * Бросает `Error` с сообщением, пригодным для показа в плашке. Прогресс и
 * смена фазы приходят в `onStatus` — без него функция работает так же,
 * просто плашка не показывает проценты.
 *
 * Возвращает `installerLaunched`: `false` означает, что нативный плагин не
 * подтвердил запуск установщика за INSTALL_ACK_TIMEOUT_MS (он мог и не
 * открыться) — вызывающий код должен сказать об этом пользователю.
 *
 * @param apkUrl прямая ссылка на APK (app-meta.json)
 * @param onStatus колбэк прогресса, вызывается много раз подряд
 */
export async function downloadAndInstallApk(
  apkUrl: string,
  onStatus?: (status: ApkUpdateStatus) => void,
): Promise<{ installerLaunched: boolean }> {
  if (!isNativeApp() || platformName() !== 'android') {
    throw new Error('Обновление доступно только в Android-приложении.');
  }

  const [{ Directory, Filesystem }] = await Promise.all([import('@capacitor/filesystem')]);

  // Разрешение на установку проверяем ДО скачивания: без него установщик
  // не откроется, и незачем качать несколько мегабайт.
  if (!(await isInstallAllowed())) {
    fail(
      'Android не разрешил установку из этого источника. Разрешите его в настройках и повторите.',
      'canInstall() = false',
      'проверка разрешения',
    );
  }

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
    // Ждём ответа плагина, но не бесконечно: если за 10 секунд ответа нет,
    // считаем, что установщик уже открыт (он же и уводит приложение в фон),
    // и просто возвращаем управление — иначе плашка зависает навсегда.
    const acked = await Promise.race([
      getInstaller().then((plugin) => plugin.install({ path })).then(() => true),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), INSTALL_ACK_TIMEOUT_MS);
      }),
    ]);
    if (!acked) {
      console.warn('[apkUpdate] установщик не подтвердил запуск за 10 с — возможно, он не открылся');
    }
    return { installerLaunched: acked };
  } catch (e) {
    if (isUnknownSourcesError(e)) {
      fail(
        'Android не разрешил установку из этого источника. Разрешите его в настройках и повторите.',
        e,
        'установка',
      );
    }
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
