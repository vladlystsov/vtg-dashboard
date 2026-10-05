import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'vtg-theme';

/**
 * Переключатель темы. Применяет data-theme к <html> — CSS-переменные
 * в index.css сами перекрашивают все элементы.
 *
 * Тема ставится ДО первой отрисовки инлайн-скриптом в index.html,
 * здесь — только для последующих переключений и сохранения выбора.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
      // По умолчанию — тёмная: чёрный с золотом и красным выглядит
      // выразительнее и ближе к тематике.
      return 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* приватный режим — просто не сохраняем */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, setTheme, toggle };
}
