package ru.vtg.dashboard;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Плагин регистрируется ДО super.onCreate(): там Bridge создаётся
        // (вызывается load()) и plugin manager читает список. После super.onCreate()
        // registerPlugin() уже не подействует — плагин просто не попадёт в мост.
        registerPlugin(ApkInstallerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
