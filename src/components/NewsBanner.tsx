import { useEffect, useMemo, useState } from 'react';
import type { AppNewsItem } from '../services/appNewsService';
import { getReadNewsIds, markNewsRead } from '../services/appNewsService';
import type { AppVersionInfo } from '../services/appVersionService';
import type { ApkUpdateStatus } from '../services/apkUpdateService';
import { downloadAndInstallApk, isInstallAllowed, openInstallSettings } from '../services/apkUpdateService';
import { CheckIcon, ChevronIcon, CloseIcon, DownloadIcon, SettingsIcon, SparkIcon } from '../design/icons';

/**
 * Плашка новостей (Фаза 5).
 *
 * Три состояния:
 *  - непрочитанная запись `appNews` — её текст важнее версии;
 *  - «Доступно обновление» — установленная версия отстаёт от опубликованной;
 *  - «У вас актуальная версия» — обновлений нет.
 *
 * Свёрнута в одну строку и раскрывается по нажатию: подробности не занимают
 * место, пока их не попросили. Закрытие запоминает, для чего именно плашка
 * закрыта (новость или версия), поэтому новая новость или новая сборка
 * покажут её снова, а повторного закрытия на месте не будет.
 *
 * На Android раскрытие показывает кнопку обновления: файл качается во
 * внутренний кэш и системный установщик открывается сам (см.
 * `apkUpdateService`), выходить в браузер не нужно.
 */
export default function NewsBanner({
  news,
  version,
}: {
  news: AppNewsItem[];
  version: AppVersionInfo | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  // null — обновление не запущено; иначе какая фаза идут и сколько процентов.
  const [apkStatus, setApkStatus] = useState<ApkUpdateStatus | null>(null);
  const [apkError, setApkError] = useState<string | null>(null);
  // Android не разрешил установку из этого источника — вместо бесконечной
  // ошибки показываем кнопку, которая ведёт в нужный экран настроек.
  const [needPermission, setNeedPermission] = useState(false);

  const unread = useMemo(() => {
    const read = new Set(getReadNewsIds());
    return news.find((n) => !read.has(n.id)) || null;
  }, [news]);

  const updateAvailable = !!version?.updateAvailable;
  const installed = version?.installed ?? null;
  const latest = version?.latest ?? null;
  const notes = version?.notes ?? [];

  // apkUrl сервис отдаёт только на Android (см. appVersionService) — в
  // браузере и на iOS кнопка установки не показывается в принципе.
  const apkUrl = version?.apkUrl ?? null;
  const canInstall = updateAvailable && !!apkUrl;

  // Установка APK на Android 8+ требует отдельного разрешения «установка из
  // неизвестных источников». Без него установщик просто не открывается, а
  // раньше это выглядело как вечное «Запуск установщика…». Проверяем заранее,
  // чтобы кнопка разрешения была на виду до первой попытки.
  useEffect(() => {
    if (!canInstall || needPermission) return;
    let active = true;
    void isInstallAllowed().then((allowed) => {
      if (active && !allowed) setNeedPermission(true);
    });
    return () => {
      active = false;
    };
  }, [canInstall, needPermission]);

  const runUpdate = () => {
    if (!apkUrl || apkStatus) return;
    setApkError(null);
    setNeedPermission(false);
    setApkStatus({ phase: 'downloading', percent: 0 });
    void downloadAndInstallApk(apkUrl, (s) => setApkStatus(s))
      .then((r) => {
        // Установщик не подтвердил запуск — скорее всего, Android его не
        // показал. Говорим прямо и предлагаем разрешить установку.
        if (!r.installerLaunched) {
          setApkError('Установщик не открылся. Разрешите установку из этого источника и попробуйте ещё раз.');
          setNeedPermission(true);
        }
      })
      .catch((e: unknown) => {
        // Техническая причина уже записана в консоль сервисом — сюда
        // приходит только фраза, пригодная для показа человеку.
        setApkError(e instanceof Error ? e.message : 'Не удалось обновить приложение.');
        setNeedPermission(/разрешени|источник|unknown/i.test(e instanceof Error ? e.message : ''));
      })
      .finally(() => setApkStatus(null));
  };

  // Ведём в системные настройки разрешения на установку из этого источника.
  const runOpenSettings = () => {
    setApkError(null);
    setNeedPermission(false);
    void openInstallSettings().catch((e: unknown) => {
      setApkError(e instanceof Error ? e.message : 'Не удалось открыть настройки установки.');
    });
  };

  // Непрочитанная новость приоритетнее версии; без неё ключ = версия.
  const key = unread ? `news:${unread.id}` : latest ? `version:${latest}` : null;
  if (!key || key === dismissedKey) return null;

  const state = unread || updateAvailable ? 'update' : 'current';
  const shownVersion = unread?.version || latest || installed;
  const title = unread
    ? unread.title
    : state === 'update'
      ? 'Доступно обновление'
      : 'У вас актуальная версия!';

  // Свёрнутая строка: короткий призыв, полный текст — в раскрытии.
  const summary =
    state === 'update' && !unread && installed && latest
      ? `Установлено v${installed} → доступно v${latest}. См. подробности`
      : 'См. подробности';

  const details = unread ? unread.text : notes.join('\n');
  // Кнопка обновления — тоже «подробности». Иначе раскрытие было бы
  // заблокировано, когда в новой версии не описано ни одного изменения,
  // и кнопки качать было бы нечего.
  const hasDetails = !!details.trim() || canInstall;

  const apkLabel =
    apkStatus?.phase === 'downloading'
      ? `Загрузка… ${apkStatus.percent}%`
      : apkStatus?.phase === 'installing'
        ? 'Запуск установщика…'
        : 'Скачать обновление';

  const close = () => {
    if (unread) markNewsRead(unread.id);
    setExpanded(false);
    setDismissedKey(key);
  };

  return (
    <div className={`news-banner news-banner--${state}`} role="status">
      <span className="news-banner-icon" aria-hidden="true">
        {state === 'update' ? <SparkIcon size={18} /> : <CheckIcon size={18} />}
      </span>

      <div className="news-banner-body">
        <button
          type="button"
          className="news-banner-head"
          aria-expanded={expanded}
          disabled={!hasDetails}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="news-banner-headline">
            <span className="news-banner-title">{title}</span>
            {shownVersion && <span className="news-banner-version">v{shownVersion}</span>}
          </span>
          <span className="news-banner-summary">{summary}</span>
          {hasDetails && (
            <span
              className={`news-banner-caret ${expanded ? 'is-open' : ''}`}
              aria-hidden="true"
            >
              <ChevronIcon size={16} />
            </span>
          )}
        </button>

        {expanded && hasDetails && (
          <div className="news-banner-details">
            {details.trim() && <div className="news-banner-text">{details}</div>}
            {canInstall && (
              <div className="news-banner-install">
                <button
                  type="button"
                  className="btn-create news-banner-download"
                  disabled={apkStatus !== null}
                  onClick={runUpdate}
                >
                  <DownloadIcon size={16} /> {apkLabel}
                </button>
                {needPermission && (
                  <button
                    type="button"
                    className="btn-secondary news-banner-settings"
                    onClick={runOpenSettings}
                  >
                    <SettingsIcon size={16} /> Разрешить установку
                  </button>
                )}
                {apkError && <p className="news-banner-install-error">{apkError}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <button type="button" className="news-banner-close" onClick={close} title="Понятно">
        <CloseIcon size={16} />
      </button>
    </div>
  );
}