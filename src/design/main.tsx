/**
 * Точка входа тестовой страницы дизайна (/design.html).
 * Намеренно НЕ импортирует src/index.css — превью полностью изолировано
 * от рабочего приложения.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import DesignPreview from './DesignPreview';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesignPreview />
  </StrictMode>,
);
