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

### Полезные ссылки

- Публичная страница айтема: `https://archive.org/details/<identifier>`
- Прямая ссылка на файл: `https://archive.org/download/<identifier>/<file>`
- Удалить лишний айтем можно в аккаунте Archive.org (страница айтема → Delete).

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
