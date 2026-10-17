import { createRoot } from 'react-dom/client'
import './index.css'

/**
 * Точка входа с защитой от «белого экрана».
 *
 * Если в сборку не попали VITE_FIREBASE_* переменные (не заполнен .env.local),
 * модуль firebase упал бы с auth/invalid-api-key ещё до createRoot — приложение
 * осталось бы пустым без единой подсказки. Здесь конфиг проверяется ДО
 * динамического импорта приложения: без конфига показываем понятный экран,
 * а firebase-модули вообще не выполняются.
 */
const envReady = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID,
)

const rootEl = document.getElementById('root')!

if (!envReady) {
  createRoot(rootEl).render(
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0b',
        color: '#e8e8ea',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 20, margin: 0 }}>Среда не настроена</h1>
      <p style={{ margin: 0, maxWidth: 480, lineHeight: 1.5, color: '#9a9aa2' }}>
        В сборку не попали переменные <code>VITE_FIREBASE_*</code>.
        Заполните файл <code>.env.local</code> в корне проекта и пересоберите
        приложение (<code>npm run cap:apk</code>).
      </p>
    </div>,
  )
} else {
  // Динамический импорт: приложение и firebase-модули загружаются
  // только при валидном конфиге.
  void import('./bootstrap')
}
