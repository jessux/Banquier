package com.banquier.app;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Exemption d'optimisation de batterie — autorisation explicite du fonctionnement
 * en arrière-plan.
 *
 * Pourquoi ce plugin existe : la surveillance Powens de fond passe par WorkManager
 * (voir src/renderer/public/runners/background.js). Tant que Banquier reste dans la
 * liste des applications « optimisées », le mode Doze regroupe et repousse ces
 * réveils — l'intervalle d'une heure demandé peut alors devenir plusieurs heures,
 * voire ne jamais se déclencher tant que le téléphone n'est pas rebranché. Sortir
 * l'app de cette liste est la seule autorisation qu'Android expose pour cela, et
 * elle ne peut être accordée que par l'utilisateur, dans une boîte de dialogue
 * système.
 *
 * Aucun plugin de la communauté n'est ajouté pour si peu : trois méthodes suffisent,
 * et elles sont enregistrées à la main dans MainActivity.
 */
@CapacitorPlugin(name = "BatteryOptimization")
public class BatteryOptimizationPlugin extends Plugin {

    /** Vrai quand Android a cessé d'appliquer ses restrictions d'arrière-plan à Banquier. */
    private boolean isExempt() {
        PowerManager manager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (manager == null) return false;
        return manager.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private JSObject state() {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("granted", isExempt());
        return result;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(state());
    }

    /**
     * Ouvre la boîte de dialogue système « Autoriser l'application à s'exécuter en
     * arrière-plan ? ». Nécessite REQUEST_IGNORE_BATTERY_OPTIMIZATIONS dans le
     * manifeste, sinon Android refuse l'intent.
     */
    @PluginMethod
    public void request(PluginCall call) {
        if (isExempt()) {
            call.resolve(state());
            return;
        }

        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));

        try {
            startActivityForResult(call, intent, "onRequestResult");
        } catch (ActivityNotFoundException | SecurityException err) {
            // Certaines surcouches constructeur et les ROMs sans Google Play ne
            // fournissent pas cette boîte de dialogue. On bascule alors sur la liste
            // complète des applications, où l'utilisateur peut faire le réglage à la
            // main — mieux qu'une erreur sans recours.
            openOptimizationList(call);
        }
    }

    @ActivityCallback
    private void onRequestResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        // Le code de retour n'est pas fiable : plusieurs versions d'Android renvoient
        // RESULT_CANCELED alors même que l'exemption vient d'être accordée. On relit
        // donc l'état réel plutôt que de l'interpréter.
        call.resolve(state());
    }

    /** Écran système listant les applications optimisées. Utile quand la boîte de
     *  dialogue directe est absente, ou pour révoquer l'exemption. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        openOptimizationList(call);
    }

    private void openOptimizationList(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(state());
        } catch (ActivityNotFoundException err) {
            call.reject("Réglage d'optimisation de batterie introuvable sur cet appareil.", err);
        }
    }
}
