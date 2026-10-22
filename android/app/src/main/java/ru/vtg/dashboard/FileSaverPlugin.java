package ru.vtg.dashboard;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Сохранение файла по ссылке в публичную папку «Загрузки».
 *
 * Зачем это нужно: в Android WebView атрибут `download` у ссылки не работает
 * — ни для обычных URL, ни тем более для blob:. Нажатие молча ничего не
 * делает, и файл из приложения скачать невозможно. Обходной путь через
 * внешний браузер работает, но теряет прогресс и имя файла, поэтому
 * качаем и кладём в «Загрузки» сами.
 *
 * Файл сразу пишется потоком в конечное хранилище, а не во временный файл
 * в кэше: архивы проектов бывают на 1 ГБ, и два прохода по сети или
 * файл под гигабайт в кэше — лишнее.
 *
 * Android 10+ (API 29+) — MediaStore, разрешения не нужны.
 * Android 6–9 — прямая запись в публичный Downloads, нужен
 * WRITE_EXTERNAL_STORAGE (в манифесте с maxSdkVersion="28").
 *
 * Метод выполняется Capacitor'ом в отдельном потоке (MessageHandler),
 * поэтому блокирующий ввод-вывод здесь допустим.
 */
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    private static final String PROGRESS_EVENT = "progress";
    private static final int BUFFER_SIZE = 64 * 1024;
    /** Очень частые уведомления о прогрессе сами тормозят загрузку. */
    private static final long PROGRESS_INTERVAL_MS = 200L;

    /**
     * Флаг отмены текущей загрузки. Метод cancel() приходит из JS в другом
     * потоке, поэтому поле атомарное, а поток загрузки проверяет его между
     * блоками и прекращает запись.
     */
    private final AtomicBoolean cancelRequested = new AtomicBoolean(false);

    /**
     * Текущее соединение. cancel() рвёт его напрямую: если сокет висит на
     * connect или чтении, одного флага недостаточно — поток увидит его
     * только после возврата из сети, то есть после таймаута в 30–60 секунд.
     */
    private volatile HttpURLConnection activeConnection;

    /** Отмена — не ошибка сети: на стороне JS по коду CANCELLED просто молчим. */
    private static class CancelledException extends Exception {
        CancelledException() {
            super("загрузка отменена");
        }
    }

    /**
     * Скачивает файл по ссылке и сохраняет его в «Загрузки».
     *
     * @param call аргументы:
     *   url       — прямая ссылка на файл (обязательна),
     *   fileName  — имя файла с расширением (необязательно, возьмём из URL),
     *   mimeType  — тип для MediaStore (необязательно, определим по расширению)
     */
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Не передана ссылка на файл");
            return;
        }

        String fileName = call.getString("fileName");
        if (fileName == null || fileName.trim().isEmpty()) {
            fileName = fileNameFromUrl(url);
        }
        fileName = sanitizeName(fileName);

        String mimeType = call.getString("mimeType");
        if (mimeType == null || mimeType.isEmpty()) {
            mimeType = guessMimeType(fileName);
        }

        try {
            cancelRequested.set(false);
            Saved saved = save(url, fileName, mimeType);
            JSObject ret = new JSObject();
            ret.put("fileName", fileName);
            ret.put("location", saved.location);
            ret.put("uri", saved.uri);
            ret.put("mimeType", mimeType);
            call.resolve(ret);
        } catch (CancelledException e) {
            call.reject("Загрузка отменена", "CANCELLED");
        } catch (Exception e) {
            call.reject("Не удалось сохранить файл: " + e.getMessage(), e);
        }
    }

    /**
     * Открывает сохранённый файл тем приложением, которое за него отвечает
     * (архив — файловым менеджером, mp3 — плеером).
     */
    @PluginMethod
    public void openFile(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.reject("Не передан путь к файлу");
            return;
        }
        String mimeType = call.getString("mimeType", "application/octet-stream");
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(uri), mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Нет приложения, которое откроет этот файл", "NO_APP");
        } catch (Exception e) {
            call.reject("Не удалось открыть файл: " + e.getMessage(), e);
        }
    }

    /**
     * Показывает папку, в которой лежит файл. Открываем её через провайдер
     * «Внешнее хранилище»: у стандартного проводника нет способа открыть
     * произвольную папку по файловому пути, а document-URI он понимает.
     */
    @PluginMethod
    public void revealFile(PluginCall call) {
        String location = call.getString("location", "");
        String fallbackUri = call.getString("uri");
        try {
            Uri folder = DocumentsContract.buildDocumentUri(
                    "com.android.externalstorage.documents",
                    "primary:" + Environment.DIRECTORY_DOWNLOADS);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(folder, DocumentsContract.Document.MIME_TYPE_DIR);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            // Проводник не умеет открывать папки — хотя бы покажем сам файл.
            if (fallbackUri != null && !fallbackUri.isEmpty()) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(Uri.parse(fallbackUri), "*/*");
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                    call.resolve();
                    return;
                } catch (Exception ignored) {
                    // Ниже отдадим исходную ошибку.
                }
            }
            call.reject("Не удалось открыть папку «" + location + "»: " + e.getMessage(), e);
        }
    }

    /**
     * Просит текущую загрузку остановиться. Отмена не мгновенная: поток
     * загрузки проверяет флаг между блоками и удаляет недописанный файл,
     * чтобы в «Загрузках» не остался обрывок архива.
     */
    @PluginMethod
    public void cancel(PluginCall call) {
        cancelRequested.set(true);
        try {
            HttpURLConnection current = activeConnection;
            if (current != null) {
                current.disconnect();
            }
        } catch (Exception ignored) {
            // Соединение уже закрыто — отменять нечего.
        }
        call.resolve();
    }

    /** Что получилось в итоге: путь для показа и URI для открытия файла. */
    private static class Saved {
        final String location;
        final String uri;

        Saved(String location, String uri) {
            this.location = location;
            this.uri = uri;
        }
    }

    private Saved save(String url, String fileName, String mimeType) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        activeConnection = connection;
        connection.setConnectTimeout(30_000);
        connection.setReadTimeout(60_000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept", "*/*");

        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("сервер ответил HTTP " + status);
            }
            if (cancelRequested.get()) {
                throw new CancelledException();
            }

            long contentLength = connection.getContentLengthLong();
            try (InputStream in = connection.getInputStream()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    return saveViaMediaStore(in, fileName, mimeType, contentLength);
                }
                return saveViaLegacyFile(in, fileName, contentLength);
            }
        } finally {
            activeConnection = null;
            connection.disconnect();
        }
    }

    /** Android 10+: MediaStore.Downloads, разрешение WRITE_EXTERNAL_STORAGE не требуется. */
    private Saved saveViaMediaStore(InputStream in, String fileName, String mimeType, long contentLength)
            throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        // Не помечать файл как «мусор»: IS_PENDING гарантирует, что в
        // галерее не появится обрывок, если запись оборвётся на середине.
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (item == null) {
            throw new IllegalStateException("не удалось создать файл в «Загрузках»");
        }

        // MediaProvider сам разводит совпадающие имена, но подстраховаться
        // нечем: если insert вернул null, пользователь ничего не получит.
        try (OutputStream out = resolver.openOutputStream(item)) {
            if (out == null) {
                throw new IllegalStateException("не удалось открыть файл на запись");
            }
            copy(in, out, contentLength);
        } catch (Exception e) {
            // Не оставляем в «Загрузках» недописанный файл. При отмене это
            // обязательно: IS_PENDING скрывает его от пользователя, но место
            // он занимает, и убрать его больше некому.
            resolver.delete(item, null, null);
            throw e;
        }

        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(item, values, null, null);

        // MediaProvider мог переименовать файл, если такое имя уже было:
        // показываем пользователю настоящее имя, а не то, что мы просили.
        String actualName = displayNameOf(resolver, item, fileName);
        return new Saved(Environment.DIRECTORY_DOWNLOADS + "/" + actualName, item.toString());
    }

    private static String displayNameOf(ContentResolver resolver, Uri item, String fallback) {
        try (android.database.Cursor cursor = resolver.query(
                item, new String[]{MediaStore.Downloads.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) {
                    return name;
                }
            }
        } catch (Exception ignored) {
            // Не смогли прочитать — вернём то, что просили.
        }
        return fallback;
    }

    /** Android 6–9: прямая запись в публичный Downloads. */
    private Saved saveViaLegacyFile(InputStream in, String fileName, long contentLength) throws Exception {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("не удалось создать папку «Загрузки»");
        }

        File target = uniqueFile(dir, fileName);
        try (OutputStream out = new FileOutputStream(target)) {
            copy(in, out, contentLength);
        }
        return new Saved(target.getAbsolutePath(), Uri.fromFile(target).toString());
    }

    /** Копирование потока с прогрессом: событие шлём примерно 5 раз в секунду. */
    private void copy(InputStream in, OutputStream out, long contentLength) throws Exception {
        byte[] buffer = new byte[BUFFER_SIZE];
        long bytes = 0;
        long lastNotify = 0L;

        int read = in.read(buffer);
        while (read != -1) {
            if (cancelRequested.get()) {
                throw new CancelledException();
            }
            out.write(buffer, 0, read);
            bytes += read;

            long now = System.currentTimeMillis();
            if (now - lastNotify >= PROGRESS_INTERVAL_MS) {
                lastNotify = now;
                JSObject progress = new JSObject();
                progress.put("bytes", bytes);
                progress.put("contentLength", contentLength);
                notifyListeners(PROGRESS_EVENT, progress);
            }
            read = in.read(buffer);
        }
        out.flush();

        // Финальное событие: без него последние проценты могли бы не дойти.
        JSObject progress = new JSObject();
        progress.put("bytes", bytes);
        progress.put("contentLength", contentLength > 0 ? contentLength : bytes);
        notifyListeners(PROGRESS_EVENT, progress);
    }

    /** Имя из URL: всё после последнего «/», без query-строки. */
    private static String fileNameFromUrl(String url) {
        String path = url;
        int query = path.indexOf('?');
        if (query >= 0) {
            path = path.substring(0, query);
        }
        int slash = path.lastIndexOf('/');
        if (slash >= 0) {
            path = path.substring(slash + 1);
        }
        return path.isEmpty() ? "download" : path;
    }

    /** Имя файла не должно содержать разделителей пути: иначе уедет за пределы «Загрузок». */
    private static String sanitizeName(String name) {
        String cleaned = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (cleaned.isEmpty() || cleaned.equals(".") || cleaned.equals("..")) {
            cleaned = "download";
        }
        return cleaned.length() > 127 ? cleaned.substring(cleaned.length() - 127) : cleaned;
    }

    private static File uniqueFile(File dir, String fileName) {
        File candidate = new File(dir, fileName);
        if (!candidate.exists()) {
            return candidate;
        }
        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String ext = dot > 0 ? fileName.substring(dot) : "";
        for (int i = 1; i < 1000; i++) {
            candidate = new File(dir, base + " (" + i + ")" + ext);
            if (!candidate.exists()) {
                return candidate;
            }
        }
        return new File(dir, System.currentTimeMillis() + "-" + fileName);
    }

    private static String guessMimeType(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".zip")) {
            return "application/zip";
        }
        if (lower.endsWith(".mp3")) {
            return "audio/mpeg";
        }
        if (lower.endsWith(".wav")) {
            return "audio/wav";
        }
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (lower.endsWith(".png")) {
            return "image/png";
        }
        if (lower.endsWith(".json")) {
            return "application/json";
        }
        return "application/octet-stream";
    }
}