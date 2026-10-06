# VTG Dashboard — состояние проекта и план работ

Документ собран по ходу работы 06.10.2026. Нужен, чтобы продолжить задачу в другом
сеансе без повторного исследования. Детали версий и истории — в README и git log.

---

## 1. Что за проект

Внутренний дашборд креативной команды (название из README — «VTG Internal Dashboard»):
задачи, заявки на треки, мастер-план, плеер, Telegram/YouGile-интеграции. Интерфейс на русском.

**Стек:** React 19 + TypeScript + Vite, Firebase (Auth + Firestore, Spark-тариф),
Capacitor 7 (Android + iOS), GitHub Pages (фронтенд), Vercel (serverless-прокси).

**Репозиторий:** `vladlystsov/vtg-dashboard`, ветка `main`, публичный.

**HEAD:** `762596d` — `fix(news): native version check via Capacitor, tappable banner details, dark-theme toast`
*(далее — незакоммиченные изменения, см. п. 4)*

**Версия сейчас:** `2.4.0` / `versionCode 1` (Android), `MARKETING_VERSION 2.4.0` (iOS), `public/app-meta.json` → `2.4.0`.

---

## Где мы сейчас (кратко)

| Фаза | Что | Статус |
|---|---|---|
| 0 | Плашка новостей, проверка версии, деплой | **Готово**, закоммичено в `762596d`, задеплоено |
| 1 | Ключ подписи Android | **Готово**, APK собран и подписан, проверено `apksigner` |
| 2 | Нативная установка APK (свой плагин) | **Готово**, скомпилировано и собрано в APK |
| 3 | Кнопка обновления в плашке | **Готово**, проверено `tsc` / `lint` / `test` / `build` |
| 4 | CI-релиз по тегу | Workflow **написан и провалидирован**; не хватает 4 секретов в GitHub |
| 5 | `apkUrl` в `app-meta.json` | **Готово** — записана вечная ссылка |
| 6 | Документация README + сквозная проверка на устройстве | **Не начато** (нужно устройство/эмулятор) |

**Блокеры, требующие решения человека:** секреты ключа в GitHub и место
для резервной копии `release.keystore` (п. 6, риск 1).

**Незакоммичено** (`git status`): `.gitignore`, `android/app/build.gradle`,
`android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`,
`AndroidManifest.xml`, `MainActivity.java`, `package.json` + lock,
`NewsBanner.tsx`, `index.css`, `appVersionService.ts`, `public/app-meta.json`,
новые: `ApkInstallerPlugin.java`, `src/services/apkUpdateService.ts`,
`.github/workflows/release-android.yml`, `PROJECT_STATE.md`.

---

## 2. Что уже сделано

### Задача «плашка новостей и обновлений» — почти готова, закоммичено и задеплоено

**Проблема:** на Android плашка молчала о новых сборках. Версия читалась из
`BASE_URL + app-meta.json`, а это **локальная копия файла внутри APK**, которая всегда
равна установленной версии — приложение сравнивало себя с собой.

**Что сделано (коммит `762596d`):**

- `src/services/appVersionService.ts` — установ­ленная версия из `@capacitor/app`
  (`App.getInfo()` → `versionName`), последняя — по абсолютному URL с `cache: 'no-store'`,
  чтобы обойти кэш service worker. Три состояния: новость / обновление / актуальная версия.
- `compareVersions()` — semver с учётом pre-release (`2.4.0` новее `2.4.0-beta`) и
  мусорных значений. Покрыто 6 тестами.
- `src/services/platform.ts` — общий `isNativeApp()` вместо дублей `isNative()`
  в `pushService.ts` и `bootstrap.tsx`.
- `NewsBanner.tsx` — нажимная плашка, подробности раскрываются по клику, закрытие помнит,
  *для чего* было закрыто (новость или версия), чтобы новая версия вернула плашку.
- `index.css` — убран верхний отступ плашки (прилипала к «Фильтр:»); цвет тоста →
  `--gray-50`. Был баг: `--gray-900` **тёмный** в светлой теме и **белый** в тёмной,
  то есть контраста не было ни в одной.
- `appNewsService.ts` — удалены неработавшие `getLastSeenVersion`/`setLastSeenVersion`
  (это они и порождали баг на Android).
- **iOS** `project.pbxproj`: `MARKETING_VERSION 1.0 → 2.4.0` (иначе iOS вечно предлагала бы
  обновление). `CURRENT_PROJECT_VERSION = 1` не трогали — это build number = Android `versionCode`.
- `.env.example` / `deploy.yml`: переменная `VITE_APP_LATEST_URL`.
- Создан `npm test` (vitest был установлен, но не подключён).

**Проверено:** `npm run lint` (только старые предупреждения), `npx tsc -b --force`,
`npm run build`, `npm test` (6/6), деплой в GitHub Pages — success.

**Задеплоено и подтверждено на живом сайте:** `app-meta.json` отдаётся с 4 заметками и
`Access-Control-Allow-Origin: *`; в бандле есть `getInfo` и путь `vtg-dashboard/app-meta`.

### Проверенные факты об инфраструктуре

- **Сайт живёт по пути `/vtg-dashboard/`, а не в корне домена.** `https://vladlystsov.github.io/` → 404,
  `https://vladlystsov.github.io/vtg-dashboard/` → 200. Отсюда дефолт
  `LATEST_URL = https://vladlystsov.github.io/vtg-dashboard/app-meta.json`.
- CORS на GitHub Pages `*` — нативный WebView может читать этот файл.
- `gh` настроен и авторизован (account `vladlystsov`).
- Для сборки APK рядом: `google-services.json` (есть, gitignored), веб-ассеты в
  `android/app/src/main/assets/public` (есть), `F:\Android\Sdk` build-tools 34 и 35.

---

## 3. Решение по обновлениям на Android (принято в этой сессии)

**Выбрано: GitHub Releases, без Google Play Store.**

Почему не Play Store (для внутреннего приложения это избыточно):

| | Факт |
|---|---|
| Play Console | **$25 одноразово**, не бесплатно |
| Личный аккаунт (создан после 13.11.2023) | закрытый тест: **12 тестировщиков непрерывно 14 дней** + подтверждение устройства через приложение Play Console |
| Target API | с 31.08.2026 Play требует **API 36**; проект на `targetSdk 35` → нужен апгрейд AGP/compileSdk. **Без Play этого не требуется** |
| Политика Play | запрещает самообновление и загрузку APK вне Play. Есть исключение: код в VM/интерпретаторе (JS в WebView) разрешён — так работает Capgo |
| Capgo (OTA только JS/CSS) | 14 дней trial, потом **$12/мес** (2000 MAU) |

Дополнительные ответы пользователя:
- **Установленного на устройствах приложения нет** (никто не ставил debug-APK) →
  можно сразу завести release-ключ, переустановка и потеря IndexedDB-данных не грозят.
- **Скачивание и установка — внутри приложения**, не через браузер.

---

## 4. Фаза 1 — Ключ подписи: ГОТОВО (не закоммичено)

Сделано и проверено. Изменённые/новые файлы в рабочем дереве:

| Файл | Состояние |
|---|---|
| `.gitignore` | добавлены `*.keystore`, `*.jks`, `keystore.properties` (проверено `git check-ignore`) |
| `android/app/release.keystore` | **новый**, gitignored |
| `android/keystore.properties` | **новый**, gitignored, в комментариях — инструкция по бэкапу |
| `android/app/build.gradle` | `signingConfigs.release` + привязка к release-сборке |

**Ключ:** alias `vtg`, RSA 4096, PKCS12, срок 10950 дней (30 лет, до 2056),
самоподписанный сертификат `CN=VTG Dashboard, OU=Mobile, O=VTG, L=Moscow, C=RU`.
Пароль — в `android/keystore.properties` (**в этот документ не внесён**, там же лежат
инструкции по бэкапу). Пароль от store и от ключа одинаков — для PKCS12 это надёжнее.

**Реализация в `build.gradle`:**
- чтение `keystore.properties` через `rootProject.file(...)`;
- `gradle.taskGraph.whenReady { ... }` — ошибка с внятным текстом выдаётся **только если
  в графе есть release-задачи**, чтобы не ломать `assembleDebug` и `cap sync`;
- `signingConfigs.release` заполняется только при наличии файла.

**Результат проверки:**
```
.\gradlew.bat assembleRelease  →  android/app/build/outputs/apk/release/app-release.apk (4 245 475 B)
apksigner verify -v            →  EXIT=0, «Verifies», v1=true, v2=true, v3/v4=false
                                   SHA-256 сертификата fd9bf8b960c754bff68b9688865ed672592432bdc3520387dbdfd2acd2c4fb90
```
43 предупреждения apksigner про `META-INF/*.version` — норма, не ошибки.

**Ошибки, которые пришлось исправить по ходу:**
- `enableV1Signing`/`enableV2Signing` — свойства `signingConfig`, а **не** `buildType`;
  на `buildType` в AGP 8.7.2 их нет (падение `Could not find method enableV1Signing()`).
  По умолчанию v1/v2 и так `true`, флаги убраны.
- Пароль ключа однажды попал в вывод ошибки Gradle. Ключ был перегенерирован, пока
  ничего не выпущено. **Урок: не поднимать в лог вывод объектов `signingConfig`.**

---

## 5. Что предстоит

### Фаза 2 — Нативная установка APK (свой плагин): СДЕЛАНО

Готовых решений нет — проверено по npm:
- `@capacitor/intent` → **404 (не существует)**
- `@capacitor-community/intent-launcher` → **404**
- `@capacitor/filesystem@7.1.9` — стоит, `peerDependencies: @capacitor/core >=7.0.0`;
  `downloadFile()` работает, хотя deprecated с 7.1.0 в пользу `@capacitor/file-transfer`
- `@capacitor/file-transfer` — стабильной версии под Cap 7 **нет** (только `3.0.0-alpha.0`,
  а `2.0.6` требует core >= 8)

Сделано:
- `@capacitor/filesystem@^7.1.9` установлен, `npx cap sync` видит 6 плагинов.
- **`android/app/src/main/java/ru/vtg/dashboard/ApkInstallerPlugin.java`** (новый):
  `@CapacitorPlugin(name = "ApkInstaller")`, метод `install({path})` →
  `FileProvider.getUriForFile(context, packageName + ".fileprovider", file)` →
  `Intent.ACTION_VIEW` + тип `application/vnd.android.package-archive` +
  `FLAG_GRANT_READ_URI_PERMISSION` + `FLAG_ACTIVITY_NEW_TASK`.
- **`MainActivity.java`**: `registerPlugin(ApkInstallerPlugin.class)` вызывается
  **ДО** `super.onCreate(savedInstanceState)`. Это принципиально: в `BridgeActivity`
  плагины пишутся в `bridgeBuilder`, а сам мост создаётся в конце `onCreate` через
  `load()` — после `super.onCreate()` регистрация уже не подействует
  (проверено по исходнику `node_modules/@capacitor/android/.../BridgeActivity.java`).
- **`AndroidManifest.xml`**: добавлен `REQUEST_INSTALL_PACKAGES`.
  `<provider>` для `FileProvider` **уже был** (authority `${applicationId}.fileprovider`),
  как и `res/xml/file_paths.xml` с `<cache-path path="." />` — покрывает весь кэш,
  создавать их не пришлось.

Проверено на собранном APK (`gradlew assembleRelease`):
- `apksigner verify` → `EXIT=0`, v1=true, v2=true, сертификат `CN=VTG Dashboard`;
- `aapt dump permissions` → `REQUEST_INSTALL_PACKAGES` присутствует;
- в `classes.dex` найден класс `ApkInstallerPlugin`, MIME-type и **русские строки
  из `reject()`** (кодировка UTF-8 корректна, U+FFFD = 0);
- authority в манифесте `ru.vtg.dashboard.fileprovider` совпадает с кодом плагина.

### Фаза 3 — Кнопка в плашке: СДЕЛАНО

- **`src/services/apkUpdateService.ts`** (новый): `Filesystem.downloadFile`
  → `Directory.Cache` (абсолютный путь, `ret.put("path", file.absolutePath)`,
  попадает под `<cache-path>`) → нативный `ApkInstaller.install({path})`.
  Слушатель прогресса `Filesystem.addListener('progress', …)` подписывается **до**
  старта загрузки и снимается в `finally` — иначе он слышал бы события и от
  чужих загрузок. `@capacitor/filesystem` и `@capacitor/core` грузятся
  динамически, чтобы веб-сборка не тащила мобильные плагины.
- **`NewsBanner.tsx`**: вместо `<a target="_blank">` — кнопка с прогрессом
  (`Загрузка… N%` → `Запуск установщика…`) и текстом ошибки; недоступна,
  пока обновление идёт.
- **Попутно исправлен баг**: `hasDetails` считался только по тексту изменений,
  поэтому при пустом `notes` плашка не раскрывалась — и кнопки качать не было бы.
  Теперь `hasDetails = !!details.trim() || canInstall`.
- **`appVersionService.ts`**: `apkUrl` отдаётся **только при `platformName() === 'android'`** —
  в браузере и на iOS кнопка установки не показывается вовсе.
- Стили: `.news-banner-download:disabled` (cursor: progress, гасится hover-эффект),
  `.news-banner-install-error` (цвет `--crimson-red`, работает в обеих темах).

### Фаза 4 — CI-релиз: WORKFLOW ГОТОВ, НЕ ХВАТАЕТ СЕКРЕТОВ

`.github/workflows/release-android.yml` написан, YAML провалидирован (`js-yaml`, exit=0).
Триггер — тег `v*`. Шаги:

1. **Guard версий** — сверяет `versionName` из `build.gradle` и `version` из
   `app-meta.json` с тегом; при расхождении падает с понятной ошибкой
   (паттерн проверен: 8 пробелов отступа, TAB в файле нет, `sed` вытаскивает `2.4.0`).
2. checkout → setup-node 20 → setup-java (temurin 21) → `npm ci` → `npm test`
3. сборка веба с секретами Firebase + прокси (блок `env` перенесён из `deploy.yml`)
4. `npx cap sync android`
5. восстановление ключа из секретов → запись `keystore.properties` + `chmod 600`
6. `./gradlew assembleRelease` (в `working-directory: android`)
7. `apksigner verify --print-certs` (build-tools ищется `find`, не зашит 35.0.0)
8. копирование в `vtg-dashboard.apk` → `gh release create <tag> vtg-dashboard.apk --generate-notes`

**Имя ассета `vtg-dashboard.apk` — контракт** с `apkUrl` в `app-meta.json`,
переименовывать нельзя.

Что осталось — добавить 4 секрета репозитория:

```powershell
# Значения НЕ печатать: ключ и пароли уходят в stdin gh.
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes('F:\Games\vtg-dashboard\android\app\release.keystore'))
$b64 | gh secret set ANDROID_KEYSTORE_BASE64

$p = @{}
Get-Content android\keystore.properties | Where-Object { $_ -and -not $_.StartsWith('#') } |
  ForEach-Object { $k,$v = $_ -split '=',2; $p[$k]=$v }
$p['storePassword'] | gh secret set ANDROID_KEYSTORE_PASSWORD
$p['keyAlias']     | gh secret set ANDROID_KEY_ALIAS
$p['keyPassword']  | gh secret set ANDROID_KEY_PASSWORD
```

### Фаза 5 — `apkUrl`: СДЕЛАНО

Записана **вечная** ссылка
`https://github.com/vladlystsov/vtg-dashboard/releases/latest/download/vtg-dashboard.apk`
в `public/app-meta.json`. Больше её менять не нужно: она всегда указывает на
последний релиз. Раньше план был «подставлять apkUrl из CI при каждом релизе» —
из-за постоянной ссылки это избыточно; CI назад в `main` ничего не пушит,
поэтому `GITHUB_TOKEN` и рекурсивный запуск `deploy.yml` не нужны.

`version` и `notes` в `app-meta.json` по-прежнему правятся вручную в том же
коммите, что и версия в `build.gradle` (guard в CI это контролирует).

### Фаза 6 — Документация и сквозная проверка: НЕ НАЧАТО

- README: раздел «Релиз Android-приложения» (чеклист + команды + бэкап ключа).
- Чеклист первого прогона: поставить подписанный APK → плашка «У вас актуальная версия!»;
  выпустить 2.5.0 → на 2.4.0 появляется «Доступно обновление» + кнопка;
  обновление встаёт поверх (тот же ключ).
- **Нужно устройство или эмулятор** — в текущей среде не выполнимо.

---

## 6. Риски и открытые вопросы

1. **Потеря `release.keystore` = обновлять приложение больше нельзя навсегда.** Android
   требует прежний ключ подписи; без него придётся менять `applicationId`, то есть
   выпускать новое приложение. Бэкап пока не придумал — **это открытый вопрос.**
   Минимум: копия `.keystore` в менеджере паролей + base64 в GitHub Secret для CI.
2. **Android Developer Verification** — Google с 2026 года требует верификации
   разработчиков для приложений, ставящихся в обход Play (первая волна: Бразилия,
   Индонезия, Сингапур, Таиланд; далее глобально). Регистрация бесплатна.
   Страницу документации (`developer.android.com/google/play/developer-verification`)
   загрузить не удалось (ошибка транспорта) — **обязательно проверить**, не касается ли
   это команды.
3. **Play Protect** будет предупреждать «приложение от непроверенного разработчика» —
   ожидаемо для внутреннего APK, стоит описать в README, чтобы люди не пугались.
4. `Filesystem.downloadFile()` deprecated — при обновлении на Capacitor 8 мигрировать
   на `@capacitor/file-transfer`.
5. **Это только Android.** На iOS самообновление в обход App Store невозможно
   (TestFlight / AltStore) — отдельная задача.
6. ~~`apkUrl` пустой~~ — **заполнено** (фаза 5): вечная ссылка на последний релиз.
7. `public/sw.js` **не обновлён**: нет исключения для `app-meta.json` из cache-first
   стратегии. В нативе SW не регистрируется, а в вебе fetch идёт с `cache: 'no-store'`,
   поэтому не блокирует, но устаревшая оболочка в кэше возможна.
8. **Синхронизация версий вручную** в трёх местах: `versionCode`/`versionName` в
   `android/app/build.gradle`, `version` в `public/app-meta.json`, `MARKETING_VERSION`
   в `ios/App/App.xcodeproj/project.pbxproj`. Guard в CI теперь сверяет **две**
   из трёх (build.gradle и app-meta.json) с тегом, но **`versionCode` и
   `MARKETING_VERSION` в iOS он не проверяет** — `versionCode` обязан расти
   при каждом релизе, иначе Android откажется ставить обновление поверх.
9. Ключ локально **один**: копии вышеуказанного файла нигде нет, кроме него самого,
   и GitHub Secret ещё не задан. См. риск 1.

---

## 7. Полезные команды

```bash
npm test                       # vitest, 6 тестов
npm run lint                   # oxlint (есть старые предупреждения, ошибок нет)
npm run build                  # tsc -b && vite build
npx tsc -b --force             # типизация вместе с тестами

npx cap sync android           # веб-ассеты + перечень плагинов в Gradle

cd android && .\gradlew.bat assembleRelease
F:\Android\Sdk\build-tools\35.0.0\apksigner.bat verify --print-certs ^
  android\app\build\outputs\apk\release\app-release.apk

# Проверить, что русские строки доехали до dex (вместе с U+FFFD должно быть 0)
aapt dump permissions android\app\build\outputs\apk\release\app-release.apk
aapt dump xmltree android\app\build\outputs\apk\release\app-release.apk AndroidManifest.xml

git check-ignore -v android/app/release.keystore   # убедиться, что ключ игнорируется
gh run list --workflow=deploy.yml                  # статус деплоя Pages
npx --yes js-yaml .github/workflows/release-android.yml >/dev/null   # валидация YAML, exit=0
```

Заметки по инструментам:
- PowerShell **не поддерживает heredoc** (`<<<`) — для `git commit -F` писать сообщение
  в временный файл.
- PowerShell ломает одинарные кавычки внутри `--jq` для `gh` — сохранять выражение в
  файл и читать его в переменную.

---

## 8. ⚠️ Правила работы с кодировкой (серьёзный урок этой сессии)

PowerShell-команды (`Set-Content`, `WriteAllText` без явной кодировки) портили русские
комментарии, записывая в файлы **невалидные байты → U+FFFD**. Пострадали 3 файла,
пришлось восстанавливать строки из git HEAD.

1. **Файлы с русским текстом редактировать только инструментами редактирования/записи,
   не через PowerShell.**
2. Перед коммитом сканировать изменённые файлы:
   ```powershell
   $t = [System.IO.File]::ReadAllText($f); [regex]::Matches($t,'\uFFFD').Count   # должно быть 0
   ```
3. **Не генерировать коммит-сообщения в PowerShell-строках** — двоичные строки «вежливого»
   сокращения могут испортить текст. Писать явно и проверять отсутствие `\uFFFD`.
4. Для JSON/XML с кириллицей читать как UTF-8 и проверять число кириллических символов
   и ноль U+FFFD (контраст: в выводе консоли текст выглядит «мусором» — это просто
   кодировка консоли, файл может быть целым).
