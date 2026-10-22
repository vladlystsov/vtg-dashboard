import { useEffect, useSyncExternalStore } from 'react';
import { getSaveToast, showSaveToast, subscribeSaveToast } from '../services/saveToastService';

/** Уведомление «файл сохранён» с кнопками «Открыть» и «В папку». */

const AUTO_HIDE_MS = 12_000;

export function SaveToast() {
  const toast = useSyncExternalStore(subscribeSaveToast, getSaveToast, getSaveToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => showSaveToast(null), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="save-toast" role="status">
      <div className="save-toast-text">
        <strong>{toast.title}</strong>
        {toast.subtitle && <span>{toast.subtitle}</span>}
      </div>
      {toast.actions.length > 0 && (
        <div className="save-toast-actions">
          {toast.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="save-toast-action"
              onClick={() => {
                showSaveToast(null);
                void action.run();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="save-toast-close"
        aria-label="Закрыть"
        onClick={() => showSaveToast(null)}
      >
        ✕
      </button>
    </div>
  );
}
