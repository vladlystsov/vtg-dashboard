package ru.vtg.dashboard;

import android.content.Intent;
import android.net.Uri;

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
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private static final String APK_MIME = "application/vnd.android.package-archive";

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

        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, APK_MIME);
            // Без GRANT_READ_URI_PERMISSION установщик не сможет прочитать
            // content://-URI, без NEW_TASK приложение уйдёт в фон и сеанс
            // установки обломается на свёрнутом окне.
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            getActivity().startActivity(intent);
        } catch (Exception e) {
            call.reject("Не удалось запустить установщик APK: " + e.getMessage(), e);
            return;
        }

        JSObject ret = new JSObject();
        ret.put("path", path);
        call.resolve(ret);
    }
}
