import { App } from '@capacitor/app';
import { isNativeApp, platformName } from './platform';

/**
 * Проверка версии приложения.
 *
 * Зачем это нужно: `public/app-meta.json` попадает в сборку, поэтому внутри
 * нативного приложения (Capacitor) его версия ВСЕГДА равна установленной —
 * сравнивать её с самой собой бессмысленно, и плашка молчала. Настоящая
 * установленная версия читается из нативного слоя через `@capacitor/app`
 * (`versionName` из build.gradle), а последняя опубликованная — с сайта.
 *
 * В браузере ровно наоборот: собранный бандр может быть устаревшим (service
 * worker отдал старый index.html), поэтому обе версии сравнимы между собой.
 */

/** Метаданные релиза, публикуемые в app-meta.json. */
export interface AppMeta {
  /** Версия, напр. «2.4.0». Должна совпадать с versionName в build.gradle. */
  version: string;
  /** versionCode Android (поле `build` app-meta.json). Должен совпадать с
   * versionCode в build.gradle и расти с каждым релизом. */
  build?: number;
  /** Что изменилось — показывается в раскрытых подробностях плашки. */
  notes?: string[];
  /** Прямая ссылка на APK (необязательно). Пусто — кнопка не рендерится. */
  apkUrl?: string;
}

export interface AppVersionInfo {
  /** Что реально работает: versionName из APK или версия веб-бандла. */
  installed: string | null;
  /** versionCode установленного приложения (на вебе — из app-meta.json бандла). */
  installedBuild: number | null;
  /** Последняя опубликованная версия (с сервера, null — если не удалось). */
  latest: string | null;
  /** versionCode последней опубликованной сборки (если опубликован). */
  latestBuild: number | null;
  /** Установленная версия отстаёт от опубликованной. */
  updateAvailable: boolean;
  /** Нативное приложение (Android/iOS), а не браузер. */
  isNative: boolean;
  /** Что нового в последней версии. */
  notes: string[];
  /** Ссылка на APK для скачивания: только на Android, там где она опубликована. */
  apkUrl: string | null;
}

/**
 * Откуда нативное приложение узнаёт о новых сборках: абсолютный URL
 * app-meta.json на задеплоенном сайте. Внутри APK лежит локальная копия
 * этого файла, которая всегда равна установленной версии — из неё новостей
 * не узнать. Путь сайта — именно /vtg-dashboard/, в корне домена его нет.
 */
const LATEST_URL =
  (import.meta.env.VITE_APP_LATEST_URL as string | undefined)?.trim() ||
  'https://vladlystsov.github.io/vtg-dashboard/app-meta.json';

/** Версия, зашитая в текущий бандл (она же — установленная в браузере). */
const BUNDLED_URL = `${import.meta.env.BASE_URL}app-meta.json`;

const FETCH_TIMEOUT_MS = 8000;

function parseMeta(raw: unknown): AppMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Partial<AppMeta>;
  if (typeof m.version !== 'string' || !m.version) return null;
  // build (versionCode) может прийти числом или строкой — приводим к числу.
  const rawBuild = (m as { build?: unknown }).build;
  const parsedBuild = typeof rawBuild === 'number' ? rawBuild : typeof rawBuild === 'string' ? Number.parseInt(rawBuild, 10) : NaN;
  return {
    version: m.version,
    build: Number.isFinite(parsedBuild) && parsedBuild > 0 ? parsedBuild : undefined,
    notes: Array.isArray(m.notes) ? m.notes.filter((n): n is string => typeof n === 'string') : [],
    apkUrl: typeof m.apkUrl === 'string' && m.apkUrl.trim() ? m.apkUrl.trim() : undefined,
  };
}

async function fetchMeta(url: string): Promise<AppMeta | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Обновление не должно приезжать из HTTP-кэша или service worker.
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return parseMeta(await res.json());
  } catch {
    // Оффлайн или CORS — не критично: плашка просто покажет «актуальная версия».
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Реальная версия нативного приложения: versionName + versionCode.
 * На Android `build` из `App.getInfo()` — это versionCode (см. AppPlugin.java:
 * `PackageInfoCompat.getLongVersionCode`), на iOS — CFBundleVersion. */
async function nativeVersion(): Promise<{ version: string | null; build: number | null }> {
  try {
    const info = await App.getInfo();
    const version = typeof info.version === 'string' && info.version ? info.version : null;
    const parsedBuild = Number.parseInt(String((info as { build?: unknown }).build ?? ''), 10);
    const build = Number.isFinite(parsedBuild) && parsedBuild > 0 ? parsedBuild : null;
    return { version, build };
  } catch {
    return { version: null, build: null };
  }
}

/**
 * Сравнение semver-подобных строк: отрицательно если a < b, 0 если равны,
 * положительно если a > b.
 *
 * Сегменты сравниваются числами (иначе «2.10.0» считалось бы старше
 * «2.9.0», т.к. '1' < '9'), а не-числовой сегмент — это pre-release
 * («2.4.0-beta»), и он считается МЛАДШЕ релиза с тем же набором чисел.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/);
  const pb = b.split(/[.+-]/);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    // Сегмент считается «меткой» (pre-release), если он есть, но не число.
    const labelA = i < pa.length && Number.isNaN(Number.parseInt(pa[i], 10));
    const labelB = i < pb.length && Number.isNaN(Number.parseInt(pb[i], 10));
    // Числовой сегмент (в т.ч. отсутствующий = 0) всегда старше метки.
    if (labelA !== labelB) return labelA ? -1 : 1;

    const na = Number.parseInt(pa[i] ?? '', 10);
    const nb = Number.parseInt(pb[i] ?? '', 10);
    const va = Number.isNaN(na) ? 0 : na;
    const vb = Number.isNaN(nb) ? 0 : nb;
    if (va !== vb) return va - vb;
  }
  return 0;
}

/**
 * Есть ли обновление.
 *
 * На Android главным считается **versionCode** (`build` в app-meta.json): он
 * обязан расти с каждым релизом, и именно по нему система понимает, что APK
 * старее установленного (versionName можно забыть поднять — тогда сравнение
 * версий молчало бы). Если хотя бы одной из build-версий нет (старый APK без
 * поля, iOS, веб), откатываемся к сравнению versionName/semver.
 */
export function isUpdateAvailable(info: {
  installedVersion: string | null;
  installedBuild: number | null;
  latestVersion: string | null;
  latestBuild: number | null;
}): boolean {
  const { installedVersion, installedBuild, latestVersion, latestBuild } = info;
  if (!installedVersion || !latestVersion) return false;
  if (installedBuild != null && latestBuild != null) return latestBuild > installedBuild;
  return compareVersions(latestVersion, installedVersion) > 0;
}

/**
 * Собирает состояние версии для плашки новостей.
 *
 * «Последняя версия» всегда читается из сети с `cache: 'no-store'`, иначе
 * service worker вернул бы из своего кэша ту же оболочку, что уже загружена,
 * и проверка ничего не сказала бы. «Установленная» — versionName и versionCode
 * из APK в нативе и версия загруженного бандра в браузере.
 */
export async function loadAppVersion(): Promise<AppVersionInfo> {
  const isNative = isNativeApp();
  const [bundled, remote] = await Promise.all([
    fetchMeta(BUNDLED_URL),
    fetchMeta(LATEST_URL),
  ]);

  const native = isNative ? await nativeVersion() : null;
  const installed = isNative ? native?.version ?? null : bundled?.version ?? null;
  const installedBuild = isNative ? native?.build ?? null : bundled?.build ?? null;
  const latestMeta = remote ?? bundled;
  const latestBuild = latestMeta?.build ?? null;

  return {
    installed,
    installedBuild,
    latest: latestMeta?.version ?? installed,
    latestBuild,
    updateAvailable: isUpdateAvailable({
      installedVersion: installed,
      installedBuild,
      latestVersion: latestMeta?.version ?? null,
      latestBuild,
    }),
    isNative,
    notes: latestMeta?.notes ?? [],
    // APK имеет смысл качать только на Android: в браузере установить его
    // нечем, а на iOS обновление в обход App Store невозможно. Поэтому
    // адрес здесь же и отбрасывается — плашка не покажет кнопку
    // «Скачать» там, где она всё равно ничего не сделает.
    apkUrl: platformName() === 'android' ? (latestMeta?.apkUrl ?? null) : null,
  };
}