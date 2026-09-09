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

## Загрузка битов в Archive.org

Битмейкер прикрепляет mp3 прямо из формы «Биты» — браузер загружает файл в командный аккаунт **Archive.org**. Archive.org сам проверяет байты файла (bit-for-bit), публикует запись в коллекции `opensource_audio` и отдаёт файл по прямой ссылке `https://archive.org/download/<identifier>/<file>`. Ссылка сохраняется в бите (`platformUrl`), и бит сразу появляется на сайте.

Схема: `браузер → s3.us.archive.org → прямой URL + опубликованный айтем`.

### 1. Ключи Archive.org

1. Возьми S3-ключи на https://archive.org/account/s3.php (раздел S3 Keys).
2. Положи значения в `.env` (`VITE_ARCHIVE_ORG_ACCESS_KEY`, `VITE_ARCHIVE_ORG_SECRET_KEY` — см. `.env.example`), а на GitHub Pages — в Secrets с теми же именами (`.github/workflows/deploy.yml` передаёт их в сборку).

> ⚠️ Ключи компилируются в JS-бандл и видны любому. Рекомендуем завести для приложения **отдельный «издательский» аккаунт Archive.org**, чтобы не светить ключи основного.

### 2. Ограничения

- Файл не больше 30 МБ (mp3/wav/ogg/m4a/aac/flac/opus).
- Во время сохранения браузер ждёт подтверждения публикации в Archive.org (обычно до 2–3 минут).
- Загружать mp3 могут только админы/владельцы и пользователи с ролью `beatmaker` (поле `roles` в профиле).

### 3. Удаление из хранилища

Удалять файлы и айтемы можно в админ-панели → «Хранилище». Используются S3-ключи того же «издательского» аккаунта: у Archive.org право на удаление есть только у аккаунта, который загрузил файл (Item uploader writable).

Важно: вместе с каждым айтемом Archive.org сам создаёт служебные файлы `<identifier>_meta.xml`, `<identifier>_files.xml` и `<identifier>_meta.sqlite`. Через S3 API их удалить нельзя — Archive.org отвечает 403 даже владельцу айтема. Поэтому в «Хранилище» они помечены как «служебные», а при удалении айтема целиком остаются: айтем превращается в пустую оболочку без содержимого. Полностью удалить айтем с Archive.org можно только обращением на info@archive.org.

Пустые оболочки скрываются из списка автоматически (метка хранится в localStorage браузера). Вернуть их можно кнопкой «показать снова» над списком или поиском по точному идентификатору.

Под списком показывается занятое место: Archive.org не отдаёт квоту аккаунта через публичный API (endpoint `services/user.php` разрешает CORS только для origin archive.org), поэтому приложение суммирует размеры всех айтемов аккаунта по данным поиска Archive.org.

### Полезные ссылки

- Публичная страница айтема: `https://archive.org/details/<identifier>`
- Прямая ссылка на файл: `https://archive.org/download/<identifier>/<file>`
- Удалять лишние файлы и айтемы удобнее в админ-панели → «Хранилище».

## Хранилище файлов (Backblaze B2)

С сентября 2026 файлы (биты mp3, проекты zip) хранятся в **Backblaze B2**, а не на Archive.org:

- приватность: ключи B2 живут только в serverless-функции `api/b2-storage.mjs` (в бандл не попадают); функция проверяет Firebase ID-токен и роль пользователя;
- загрузка: браузер получает presigned PUT URL и льёт файл напрямую в B2 — zip до 1 ГБ без ограничений serverless;
- ссылки: постоянные — указывают на нашу функцию `/api/b2-storage?path=…`, которая 302-редиректом отдаёт presigned GET (15 минут). Бакет может быть полностью **приватным**;
- удаление и список файлов — через функцию (админ-панель → «Хранилище»); вкладка «Archive.org (легаси)» осталась для перелинковки/очистки;
- S3-ключи Archive.org больше не используются и могут быть удалены из окружения.

### Настройка B2 (один раз)

1. backblaze.com → Sign Up (бесплатно, карта не нужна; free tier: 10 ГБ хранения, 3× эгресса в месяц).
2. Buckets → Create Bucket: имя, например `vtg-storage`; **Files in Bucket are: Private (Частная)** — частный бакет не требует карту (гейт «история платежей / $1» стоит только на Public-бакетах, это анти-абьюз). Default Encryption — по умолчанию; **Object Lock — отключить** (иначе объекты нельзя будет удалять).
3. Region: скопируйте из «S3 Endpoint» на странице бакета (напр. `us-west-004` или `eu-central-003`) — это значение `B2_REGION`.
4. App Keys → Add Application Key: ограничить ключ этим бакетом → записать keyID и applicationKey (показывается один раз).
5. Vercel → Settings → Environment Variables (и в `.env.local` для `vercel dev`):
   `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET_NAME`, `B2_REGION` (для клиента — `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`);
   `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID` — runtime-переменные **для serverless-функции** (без префикса `VITE_`, иначе Vercel не отдаёт их в функцию);
   `B2_LINK_BASE` — постоянная база ссылок на файлы, полный URL функции (напр. `https://<project>.vercel.app/api/b2-storage`);
   опционально `VITE_B2_PROXY_URL` (если SPA на GitHub Pages — полный URL функции).

### Миграция старых файлов с Archive.org

1. `npm i -D firebase-admin` и `serviceAccountKey.json` (Firebase Console → Project settings → Service accounts → Generate new private key; в git не коммитится).
2. Заполнить env `B2_*` и `B2_LINK_BASE` (см. выше).
3. `node _migrate-ia-to-b2.mjs --dry-run` — превью; затем без флага: скрипт скачает файлы с Archive.org, зальёт в B2 и перелинкует `platformUrl` / `projectZipUrl` / `projectZips` / `zipUrl` в Firestore.
4. После успешной миграции удалите содержимое на Archive.org (админ-панель → «Archive.org (легаси)») и запросите полную стирку аккаунта на info@archive.org.

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
