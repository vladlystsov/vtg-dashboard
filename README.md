# VTG Internal Dashboard ❄️

Личный кабинет для команды VTG: канбан-доска для управления треками, чек-листы этапов, авторизация, офлайн-режим.

Заменяет Telegram-группу и YouGile единым интерактивным инструментом.

## Возможности (Этап 1 — MVP)

- **Авторизация** — регистрация/вход по email + паролю (Firebase Auth)
- **Канбан-доска** — 5 колонок: Идеи, В работе, На проверке, Готово к релизу, Вышло
  - Drag & Drop перемещение карточек
  - Карточка: название, артист, битмейкер, проект, приоритет, прогресс, дедлайн
- **Создание/редактирование трека**:
  - Название, артист, битмейкер, проект/альбом, статус, приоритет
  - Чек-лист из 8 этапов: Бит, Текст, Запись, Сведение, Мастеринг, Обложка, Контент, Релиз
  - У каждого пункта: статус (ожидание → в работе → готово → на проверке → проверено), ответственный, дедлайн, комментарий, вложение
- **Список треков** — табличное представление
- **Команда** — карточки участников
- **Офлайн-режим** — данные кешируются локально (IndexedDB), при появлении интернета — синхронизация
- **Индикатор сети** — зелёный (онлайн) / красный (офлайн)

## Технологии

- React 19 + TypeScript + Vite
- Firebase (Auth + Firestore) — бесплатный Spark-тариф
- @hello-pangea/dnd — drag & drop
- idb — IndexedDB для офлайн-режима
- date-fns — работа с датами

## Быстрый старт

### 1. Настройка Firebase (бесплатно)

1. Открой [Firebase Console](https://console.firebase.google.com)
2. **Создать проект** → назови его, например `vtg-dashboard`
3. В проекте: **Build → Authentication → Get Started** → включи **Email/Password** (Sign-in method → Email/Password → Enable)
4. **Build → Firestore Database → Create database** (Start in production mode)
5. **Project settings (⚙️) → Your apps → Web app `</>`** → зарегистрируй приложение (Name: `vtg-dashboard`) → скопируй конфиг
6. Создай файл `.env` в корне проекта (см. `.env.example`) и вставь свои ключи

### 2. Установка и запуск

```bash
npm install
cp .env.example .env   # заполни своими ключами Firebase
npm run dev            # локальный сервер http://localhost:5173
```

### 3. Сборка и деплой на GitHub Pages

```bash
npm run build          # сборка в папку dist/
npm run deploy         # публикация через gh-pages
```

Или через GitHub Actions (папка `.github/workflows`), либо вручную через Settings → Pages.

## Хранилище файлов (Backblaze B2)

Файлы (биты mp3, проекты zip) хранятся в **Backblaze B2**:

- приватность: ключи B2 живут только в serverless-функции `api/b2-storage.mjs` (в бандл не попадают); функция проверяет Firebase ID-токен и роль пользователя;
- загрузка: браузер получает presigned PUT URL и льёт файл напрямую в B2 — zip до 1 ГБ без ограничений serverless;
- ссылки: постоянные — указывают на нашу функцию `/api/b2-storage?path=…`, которая 302-редиректом отдаёт presigned GET (15 минут). Бакет может быть полностью **приватным**;
- удаление и список файлов — через функцию (админ-панель → «Хранилище»).

Схема: `браузер → serverless-функция (presigned URL) → Backblaze B2`.

### 1. Настройка B2 (один раз)

1. backblaze.com → Sign Up (бесплатно, карта не нужна; free tier: 10 ГБ хранения, 3× эгресса в месяц).
2. Buckets → Create Bucket: имя, например `vtg-storage`; **Files in Bucket are: Private (Частная)** — частный бакет не требует карту (гейт «история платежей / $1» стоит только на Public-бакетах, это анти-абьюз). Default Encryption — по умолчанию; **Object Lock — отключить** (иначе объекты нельзя будет удалять).
3. Region: скопируйте из «S3 Endpoint» на странице бакета (напр. `us-west-004` или `eu-central-003`) — это значение `B2_REGION`.
4. App Keys → Add Application Key: ограничить ключ этим бакетом → записать keyID и applicationKey (показывается один раз).
5. **CORS-правила бакета — обязательны**. Без них Backblaze отвечает на прямые загрузки из браузера **405 Method Not Allowed** (это и есть «хранилище выдает 405»). На странице бакета → Bucket Settings → CORS Rules добавьте правило:
   - `AllowedOrigins`: `https://<ваш-домен>` (для локальной разработки добавьте `http://localhost:5173`; можно `*`),
   - `AllowedOperations`: `s3_get`, `s3_head`, `s3_put`, `s3_post` (плюс `b2_upload_file`, `b2_download_file_by_name`),
   - `AllowedHeaders`: `content-type`, `x-amz-*` (или `*`),
   - `ExposeHeaders`: `etag`.
6. Vercel → Settings → Environment Variables (и в `.env.local` для `vercel dev`):
   `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET_NAME`, `B2_REGION` (для клиента — `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`);
   `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID` — runtime-переменные **для serverless-функции** (без префикса `VITE_`, иначе Vercel не отдаёт их в функцию);
   `B2_LINK_BASE` — постоянная база ссылок на файлы, полный URL функции (напр. `https://<project>.vercel.app/api/b2-storage`);
   опционально `VITE_B2_PROXY_URL` (если SPA на GitHub Pages — полный URL функции).

### 2. Ограничения

- Файл не больше 30 МБ (mp3/wav/ogg/m4a/aac/flac/opus), архив проекта — до 1 ГБ (.zip).
- Ошибка загрузки с кодом 405/403 указывает на ненастроенные CORS-правила бакета (см. п. 5 выше).
- Загружать mp3 могут только админы/владельцы и пользователи с ролью `beatmaker` (функция проверяет роль по Firestore).

### 3. Удаление из хранилища

Удалять файлы можно в админ-панели → «Хранилище» (только админы/владельцы). Перед удалением приложение предупреждает, если файл используется в карточках треков/битов/проектов.

## Структура проекта

```
src/
├── components/
│   ├── App.tsx            # корневой компонент, загрузка данных
│   ├── Header.tsx         # шапка: логотип, навигация, индикатор сети
│   ├── KanbanBoard.tsx    # канбан-доска с drag & drop
│   ├── TrackCard.tsx      # карточка трека
│   ├── TrackForm.tsx      # форма создания/редактирования с чек-листом
│   ├── TracksListView.tsx # список треков
│   └── LoginPage.tsx      # страница входа/регистрации
├── config/
│   └── firebase.ts        # инициализация Firebase
├── contexts/
│   └── AuthContext.tsx    # контекст авторизации
├── hooks/
│   └── useNetwork.ts      # статус сети
├── services/
│   ├── trackService.ts    # операции с Firestore
│   └── offlineStorage.ts  # кеш IndexedDB + очередь синхронизации
└── types/
    └── track.ts           # типы и константы
```

## Дорожная карта

- **Этап 1 (MVP)** ✅ — веб-версия с локальным хранением и офлайн-кешем (этот репозиторий)
- **Этап 2** — полная синхронизация, уведомления о проверке, загрузка файлов в Firebase Storage
- **Этап 3** — мобильное приложение (React Native)
