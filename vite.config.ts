import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        // Основное приложение
        main: new URL('./index.html', import.meta.url).pathname,
        // Тестовая страница новой дизайн-системы (Фаза 0-1).
        // Изолирована от приложения: свой main.tsx и свои стили.
        design: new URL('./design.html', import.meta.url).pathname,
      },
    },
  },
})
