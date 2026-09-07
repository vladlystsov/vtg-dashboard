# SoundCloud: импорт треков и профиля

Как устроен импорт музыки из SoundCloud в приложении и как развернуть недостающие куски.
Актуально на сентябрь 2026. Утверждения проверены живыми запросами — тест-харнесс
`_soundcloud-profile-test.mjs` (resolve профиля → пагинация треков → валидация).

---

## Что умеет импорт сейчас

| Что вставлено в поле SoundCloud | Откуда берутся данные |
|---|---|
| Ссылка на трек: `soundcloud.com/<user>/<track>`, `on.soundcloud.com/…`, `snd.sc/…` | oEmbed `soundcloud.com/oembed` прямо из браузера (CORS открыт): название, автор, обложка, канонический permalink |
| Ссылка на профиль: `soundcloud.com/<user>` или `…/<user>/tracks` | Наш serverless-прокси `GET /api/soundcloud-profile?url=…` → все треки профиля списком |

Ссылки можно вставлять пачкой (через запятую или с новой строкой), профили и одиночные треки можно смешивать.

## Архитектура

```
Одиночный трек:   SPA ──── GET soundcloud.com/oembed ───▶ SoundCloud           (браузер, CORS ок)

Профиль целиком:  SPA ──── GET /api/soundcloud-profile?url=… ───▶ Vercel Function
                    Function ──▶ api-v2.soundcloud.com/resolve?url=…&client_id=…          → { id, username, track_count }
                    Function ──▶ api-v2.soundcloud.com/users/{id}/tracks?limit=200
                                  &linked_partitioning=true                               (пагинация по next_href)
                    Function ──▶ SPA: JSON { user, total, items:[{title,url,author,thumbnail}] }  (CORS: *)
```

Реализация: `api/soundcloud-profile.mjs` (Vercel Node runtime, без зависимостей).
Вызов из SPA: `fetchSoundCloudProfileItems` в `src/services/platformImportService.ts`.

### Почему без серверной функции нельзя (проверено 2026-09)

| Канал | Из браузера | Из Node/serverless |
|---|---|---|
| HTML-страницы soundcloud.com | — | ❌ DataDome 202 challenge |
| `soundcloud.com/oembed` | ✅ CORS открыт — используем для треков | ❌ DataDome 202 challenge |
| `api-v2.soundcloud.com` (`/resolve`, `/users/{id}/tracks`) | ❌ CORS закрыт для чужих origin (`Vary: Origin`, ACAO не отдаётся) | ✅ работает с публичным client_id |
| Официальный `api.soundcloud.com` | — | ⚠️ требует OAuth 2.1 + приложение (нужен Artist Pro) |

Список треков профиля отдаёт только `api-v2`, а он отвечает только серверу.
Серверу при этом не нужны ни HTML-скрейпинг (антибот), ни секреты: используется
**публичный** `client_id` — тот, что сам сайт soundcloud.com шлёт в открытом виде.

### Про client_id (важно знать)

- Это **не секрет**: зашит в функцию дефолтом, переопределяется переменной окружения `SC_CLIENT_ID`.
- SoundCloud может его ротировать (это ключ их веб-плеера). Если функция начнёт отвечать
  401/403 — берём свежий client_id из трафика сайта и обновляем дефолт в
  `api/soundcloud-profile.mjs` (передеплой функции, SPA не трогаем) или задаём `SC_CLIENT_ID`
  в настройках проекта Vercel.
- Использование публичного client_id — «серая зона» ToS. Легальный путь — официальный API,
  см. приложение в конце документа.

## Ответ функции

`GET /api/soundcloud-profile?url=https://soundcloud.com/<user>&limit=100`

| Поле | Тип | Описание |
|---|---|---|
| `user.id` | number | числовой id профиля |
| `user.username` | string | отображаемое имя |
| `user.permalink` | string | канонический URL профиля |
| `user.trackCount` | number | всего треков на SoundCloud |
| `total` | number | треков в `items` (с учётом лимита) |
| `items[]` | `{ title, url, author, thumbnail? }` | только треки с permalink-URL, без дублей |

Параметры: `url` — обязателен; `limit` — 1..500, по умолчанию 100.
Поддерживаются и короткие ссылки «Поделиться» (`on.soundcloud.com/…`, `snd.sc/…`):
прокси сам раскрывает редирект; если цель — трек/плейлист, вернётся 400 с подсказкой.
Ошибки — `{ "error": "…" }` с кодами 400/404/405/502.

## Развёртывание

### Вариант 1 (проще всего): весь SPA на Vercel

`vercel.json` уже в репозитории: сборка `npm run build` → `dist`, SPA-rewrites на `index.html`;
функции из `api/` подхватываются автоматически. Профильный импорт работает «из коробки» —
SPA по умолчанию зовёт `/api/soundcloud-profile` на своём origin (константа
`SOUNDCLOUD_PROFILE_PROXY` в `src/services/platformImportService.ts`).

### Вариант 2: SPA остаётся на GitHub Pages, прокси — отдельным проектом на Vercel

1. Импортировать репозиторий в Vercel (New Project → Import) — получится
   `https://<project>.vercel.app`; нужна только функция `…/api/soundcloud-profile`
   (для теста откройте её в браузере — должна вернуть JSON с `items`).
2. GitHub → Settings → Secrets and variables → Actions → добавить секрет
   `VITE_SOUNDCLOUD_PROXY_URL` = `https://<project>.vercel.app/api/soundcloud-profile`.
3. `.github/workflows/deploy.yml` уже пробрасывает этот секрет в сборку (`npm run build`).
4. Функция отдаёт `Access-Control-Allow-Origin: *`, поэтому GitHub Pages её вызывает без проблем.

### Быстрая проверка

- Локально: `node _soundcloud-profile-test.mjs` (resolve + пагинация + валидация треков).
- На проде: `https://<project>.vercel.app/api/soundcloud-profile?url=https://soundcloud.com/zhenya-11413880&limit=5`.

---

## Приложение: официальный API (если появится Artist Pro)

Официальная документация: https://developers.soundcloud.com/
SoundCloud перешёл на **новый API** (OAuth 2.1, база `https://api.soundcloud.com`). Процесс
«Get an API key»: зарегистрировать приложение (в браузере или через API credentials CLI) и
получить `client_id` + `client_secret`; `client_secret` держать только на сервере.
Официально регистрация приложения требует аккаунт **Artist Pro** (платный тариф).

### Поток Client Credentials (для публичных данных)

1. `POST https://secure.soundcloud.com/oauth/token` (grant_type=client_credentials) → `access_token` (~1 час).
2. `GET https://api.soundcloud.com/resolve?url=https://soundcloud.com/ПЕРМАЛИНК` с заголовком
   `Authorization: OAuth <token>` → ресурс с `id`.
3. `GET https://api.soundcloud.com/users/{id}/tracks?linked_partitioning=true&limit=200` → все страницы.

Rate limits: play-запросы 15 000/24ч; **client credentials токены: 50 за 12ч на приложение
и 30/час с одного IP** — токен получаем один раз и переиспользуем ~55 минут.
Если оформите Artist Pro — функция `api/soundcloud-profile.mjs` переключается на официальный
API минимальной правкой (другой base URL и заголовок `Authorization`).