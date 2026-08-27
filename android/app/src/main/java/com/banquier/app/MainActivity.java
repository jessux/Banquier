package com.banquier.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Les plugins définis dans le module applicatif ne sont pas découverts
        // automatiquement (contrairement à ceux de node_modules) : il faut les
        // enregistrer avant super.onCreate(), sinon le pont est déjà construit et
        // window.Capacitor ne les voit jamais.
        registerPlugin(BatteryOptimizationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
