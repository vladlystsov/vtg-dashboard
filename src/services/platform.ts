/**
 * Определение платформы запуска. Раньше проверка `Capacitor.isNativePlatform()`
 * была продублирована в pushService и bootstrap — держим её в одном месте,
 * потому что от неё теперь зависят и push, и проверка версии приложения.
 */
export function isNativeApp(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** Короткое имя платформы: 'android' | 'ios' | 'web'. */
export function platformName(): 'android' | 'ios' | 'web' {
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const p = cap?.getPlatform?.();
  return p === 'android' || p === 'ios' ? p : 'web';
}