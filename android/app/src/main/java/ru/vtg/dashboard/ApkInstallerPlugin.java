package ru.vtg.dashboard;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Установка скачанного APK без выхода в браузер.
 *
 * Системный установщик запускается через ACTION_VIEW и content://-URI,
 * который отдаёт FileProvider (provider объявлен в AndroidManifest.xml,
 * пути — в res/xml/file_paths.xml). Файл лежит в кэше приложения, куда
 * FileProvider пересылает URI по правилам <cache-path>.
 *
 * file:// открыть нельзя начиная с Android 7.0 (FileUriExposedException),
 * поэтому без FileProvider этот метод не заработает.
 *
 * Отдельно про разрешение «установка из неизвестных источников»: начиная с
 * Android 8 без него установщик может просто не открыться, и обновление
 * выглядит как зависшее. Поэтому перед запуском проверяем
 * canRequestPackageInstalls() и умеем отправлять пользователя в настройки.
 *
 * Порядок в install() важен: `call.resolve()` выполняется ДО
 * startActivity(). Когда установщик открывается, приложение уходит в фон, и
 * ответ моста может не дойти до JS — раньше на этом шаге плашка зависала
 * с надписью «Запуск установщика…». Ответ уходит первым, а запуск — следом.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private static final String APK_MIME = "application/vnd.android.package-archive";

    /** Код ошибки: приложению не разрешено ставить пакеты из этого источника. */
    private static final String ERR_UNKNOWN_SOURCES = "NEEDS_UNKNOWN_SOURCES";

    /** Разрешено ли приложению запускать установщик (Android 8+). */
    private boolean installAllowed() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true; // до Android 8 проверки нет
        try {
            return getContext().getPackageManager().canRequestPackageInstalls();
        } catch (Exception e) {
            return true; // не смогли проверить — пробуем запустить как есть
        }
    }

    /**
     * Проверка разрешения без скачивания APK: при отказе можно сразу
     * показать кнопку «Разрешить установку», не качая несколько мегабайт.
     */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("allowed", installAllowed());
        call.resolve(ret);
    }

    /** Открывает экран настроек «Установка неизвестных приложений» для этого приложения. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Не удалось открыть настройки установки: " + e.getMessage(), e);
        }
    }

    /**
     * Запускает установщик Android на файле по абсолютному пути.
     *
     * @param call аргументы: path — абсолютный путь к скачанному APK
     */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("Не передан путь к файлу APK");
            return;
        }

        File apk = new File(path);
        if (!apk.isFile()) {
            call.reject("Файл APK не найден: " + path);
            return;
        }

        // Без этого разрешения установщик на многих устройствах просто не
        // открывается — и обновление выглядит как зависшее.
        if (!installAllowed()) {
            call.reject(
                ERR_UNKNOWN_SOURCES,
                "Android не разрешил установку из этого источника. Разрешите его в настройках и повторите."
            );
            return;
        }

        Uri uri;
        try {
            uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );
        } catch (Exception e) {
            call.reject("Не удалось получить ссылку на файл APK: " + e.getMessage(), e);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, APK_MIME);
        // Без GRANT_READ_URI_PERMISSION установщик не сможет прочитать
        // content://-URI, без NEW_TASK приложение уйдёт в фон и сеанс
        // установки обломается на свёрнутом окне.
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        // Отвечаем ДО запуска установщика: после ухода в фон ответ моста
        // может не дойти, и JS ждал бы его вечно.
        JSObject ret = new JSObject();
        ret.put("path", path);
        ret.put("launched", true);
        call.resolve(ret);

        try {
            getActivity().startActivity(intent);
        } catch (Exception e) {
            // Ответ уже отправлен, отменить его нельзя — только лог.
            android.util.Log.e("ApkInstaller", "Не удалось запустить установщик APK", e);
        }
    }
}