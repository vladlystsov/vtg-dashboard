import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Конфигурация Capacitor — обёртка SPA в нативное Android-приложение.
 * Собирается из той же папки dist, что и веб-версия, поэтому функционал
 * у мобильного клиента ровно такой же.
 */
const config: CapacitorConfig = {
  appId: 'ru.vtg.dashboard',
  appName: 'VTG Dashboard',
  webDir: 'dist',
  android: {
    // Позволяет загружать картинки/аудио с внешних доменов (B2, SoundCloud,
    // YouTube) без ручного добавления каждого хоста.
    allowMixedContent: true,
    backgroundColor: '#0a0a0b',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorPushNotifications: {
      // Канал по умолчанию для Android 8+ — без него уведомления молча
      // не показываются, если приложение в фоне.
      presentationOptions: ['badge', 'alert', 'sound'],
    },
    Keyboard: {
      // На Android клавиатура не должна перекрывать поля ввода.
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
