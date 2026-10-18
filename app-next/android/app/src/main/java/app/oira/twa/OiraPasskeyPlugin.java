package app.oira.twa;

import android.os.CancellationSignal;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePublicKeyCredentialRequest;
import androidx.credentials.CreatePublicKeyCredentialResponse;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPublicKeyCredentialOption;
import androidx.credentials.PublicKeyCredential;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Passkeys for app.myoira.com, asked of Android's Credential Manager directly.
 *
 * The WebView will not do passkeys here at all: the app's pages come from inside the APK, with
 * no certificate, and WebAuthn refuses any page without one ("not supported on sites with TLS
 * certificate errors", from the A13). So the page hands the same WebAuthn request, as JSON, to
 * this plugin, and Credential Manager shows Android's own passkey sheet. assetlinks.json on
 * app.myoira.com already names this package and its signing key, which is what lets the app ask
 * for a passkey on that domain, the same one she has on the web.
 *
 * Nothing secret passes through here in either direction except what WebAuthn itself returns:
 * the request carries a random challenge and the PRF salt, the response the public key material
 * and the PRF output the page derives her key from.
 */
@CapacitorPlugin(name = "OiraPasskey")
public class OiraPasskeyPlugin extends Plugin {

    private CredentialManager manager() {
        return CredentialManager.create(getContext());
    }

    @PluginMethod
    public void create(PluginCall call) {
        final String json = call.getString("request");
        if (json == null || getActivity() == null) {
            call.reject("missing request", "BAD_REQUEST");
            return;
        }
        CreatePublicKeyCredentialRequest request = new CreatePublicKeyCredentialRequest(json);
        manager().createCredentialAsync(getActivity(), request, new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                @Override
                public void onResult(CreateCredentialResponse response) {
                    if (!(response instanceof CreatePublicKeyCredentialResponse)) {
                        call.reject("not a passkey", "WRONG_TYPE");
                        return;
                    }
                    JSObject out = new JSObject();
                    out.put("response", ((CreatePublicKeyCredentialResponse) response).getRegistrationResponseJson());
                    call.resolve(out);
                }

                @Override
                public void onError(@NonNull CreateCredentialException e) {
                    call.reject(String.valueOf(e.getMessage()), e.getType());
                }
            });
    }

    @PluginMethod
    public void get(PluginCall call) {
        final String json = call.getString("request");
        if (json == null || getActivity() == null) {
            call.reject("missing request", "BAD_REQUEST");
            return;
        }
        /* Only passkeys already on this phone, Google-synced ones included. Without this, a
           phone with none showed an empty "choose a passkey" sheet she had to cancel before
           the "save passkey" sheet could appear. With it, there is simply no sheet, Android
           says so, and the app goes straight to making one. */
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(new GetPublicKeyCredentialOption(json))
            .setPreferImmediatelyAvailableCredentials(true)
            .build();
        manager().getCredentialAsync(getActivity(), request, new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (!(credential instanceof PublicKeyCredential)) {
                        call.reject("not a passkey", "WRONG_TYPE");
                        return;
                    }
                    JSObject out = new JSObject();
                    out.put("response", ((PublicKeyCredential) credential).getAuthenticationResponseJson());
                    call.resolve(out);
                }

                @Override
                public void onError(@NonNull GetCredentialException e) {
                    call.reject(String.valueOf(e.getMessage()), e.getType());
                }
            });
    }
}
