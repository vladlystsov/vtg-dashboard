import { useMemo, useState } from 'react';
import type { AppNewsItem } from '../services/appNewsService';
import { getReadNewsIds, markNewsRead } from '../services/appNewsService';
import type { AppVersionInfo } from '../services/appVersionService';
import { CheckIcon, ChevronIcon, CloseIcon, DownloadIcon, SparkIcon } from '../design/icons';

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

  const unread = useMemo(() => {
    const read = new Set(getReadNewsIds());
    return news.find((n) => !read.has(n.id)) || null;
  }, [news]);

  const updateAvailable = !!version?.updateAvailable;
  const installed = version?.installed ?? null;
  const latest = version?.latest ?? null;
  const notes = version?.notes ?? [];

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
  const hasDetails = !!details.trim();

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
            <div className="news-banner-text">{details}</div>
            {state === 'update' && version?.isNative && version.apkUrl && (
              <a
                className="btn-create news-banner-download"
                href={version.apkUrl}
                target="_blank"
                rel="noreferrer"
              >
                <DownloadIcon size={16} /> Скачать APK
              </a>
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