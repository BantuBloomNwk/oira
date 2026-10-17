package app.oira.twa;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Passkeys inside the app.
     *
     * The system WebView ships with WebAuthn off. Turned on for this app, a passkey request
     * goes to Android's Credential Manager, which reads assetlinks.json on app.myoira.com and
     * checks this package and its signing key before it will make or return a passkey for
     * that domain. That is what gives her the same passkey, and the same address, in the app
     * as on the web.
     *
     * On a WebView too old for it nothing changes: the page finds no passkeys and the wallet
     * is the way in.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Android's own fingerprint sheet, for phones where passkeys are not available in the
        // WebView. Registered before the bridge starts. See OiraBiometricPlugin.
        registerPlugin(OiraBiometricPlugin.class);
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            WebSettingsCompat.setWebAuthenticationSupport(
                webView.getSettings(),
                WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP
            );
        }
    }
}
