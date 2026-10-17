package app.oira.twa;

import android.os.Build;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Her fingerprint, asked by Android itself.
 *
 * Passkeys inside the app depend on the phone's WebView supporting them, and on some phones and
 * WebView versions they are simply not there. Without this, tapping "Use my fingerprint" on such
 * a phone carried on with no prompt at all. This asks Android's own biometric sheet instead, with
 * the phone's PIN or pattern as the fallback where there is no fingerprint sensor.
 */
@CapacitorPlugin(name = "OiraBiometric")
public class OiraBiometricPlugin extends Plugin {

    private int authenticators() {
        // A PIN or pattern alongside the fingerprint is only allowed from Android 11.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        }
        return BiometricManager.Authenticators.BIOMETRIC_WEAK;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(authenticators());
        JSObject out = new JSObject();
        out.put("available", r == BiometricManager.BIOMETRIC_SUCCESS);
        out.put("code", r);
        call.resolve(out);
    }

    @PluginMethod
    public void confirm(PluginCall call) {
        final String title = call.getString("title", "Is it you?");
        final String subtitle = call.getString("subtitle", "");
        final FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("no activity", "NO_ACTIVITY");
            return;
        }
        activity.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setAllowedAuthenticators(authenticators());
            if (!subtitle.isEmpty()) info.setSubtitle(subtitle);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) info.setNegativeButtonText("Not now");

            BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        JSObject out = new JSObject();
                        out.put("ok", true);
                        call.resolve(out);
                    }

                    @Override
                    public void onAuthenticationError(int code, @NonNull CharSequence message) {
                        call.reject(message.toString(), String.valueOf(code));
                    }
                });
            try {
                prompt.authenticate(info.build());
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()), "PROMPT_FAILED");
            }
        });
    }
}
