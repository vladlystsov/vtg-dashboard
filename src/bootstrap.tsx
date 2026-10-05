import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * Регистрация service worker для PWA (офлайн-оболочка + Web Push).
 *
 * В нативных приложениях (Capacitor WebView) SW не регистрируем:
 * там ассеты локальные и офлайн и так работает, а SW наоборот мог бы
 * отдавать устаревшую кэшированную оболочку после cap sync.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => {
      console.warn('service worker registration failed', e);
    });
  });
}
registerServiceWorker();
import { AuthProvider } from './contexts/AuthContext'
import App from './components/App'
import LoginPage from './components/LoginPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAuth } from './contexts/AuthContext'

function Root() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="loading-screen">
        <div className="loading-spinner-container">
          <span className="loading-spinner" />
          <span>Загрузка…</span>
        </div>
      </div>
    );
  return user ? <App /> : <LoginPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
