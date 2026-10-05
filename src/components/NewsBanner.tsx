import { useMemo, useState } from 'react';
import type { AppNewsItem } from '../services/appNewsService';
import {
  getReadNewsIds,
  markNewsRead,
  getLastSeenVersion,
  setLastSeenVersion,
} from '../services/appNewsService';

/**
 * Плашка новостей (Фаза 5): показывает непрочитанную новость `appNews`
 * или смену версии из public/app-meta.json. Закрытие помечает прочитанным
 * в localStorage — повторно не показывается до выхода новой версии/новости.
 */
export default function NewsBanner({
  news,
  version,
}: {
  news: AppNewsItem[];
  version: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);

  const unread = useMemo(() => {
    const read = new Set(getReadNewsIds());
    return news.find((n) => !read.has(n.id)) || null;
  }, [news]);

  const versionChanged = !!version && version !== getLastSeenVersion();

  if (dismissed || (!unread && !versionChanged)) return null;

  const title = unread
    ? unread.title
    : 'Новая версия приложения';
  const shownVersion = unread?.version || version;
  const text = unread
    ? unread.text
    : 'Обновите страницу, чтобы получить новую версию.';

  const close = () => {
    if (unread) markNewsRead(unread.id);
    if (version) setLastSeenVersion(version);
    setDismissed(true);
  };

  return (
    <div className="news-banner" role="status">
      <div className="news-banner-body">
        <div className="news-banner-head">
          {shownVersion && <span className="news-banner-version">v{shownVersion}</span>}
          <span className="news-banner-title">{title}</span>
        </div>
        {text && <div className="news-banner-text">{text}</div>}
      </div>
      <button type="button" className="news-banner-close" onClick={close} title="Понятно">
        ✕
      </button>
    </div>
  );
}
