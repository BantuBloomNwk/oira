import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './native';
import { b64 } from './owner';

/* Passkeys in the Android app, through Credential Manager. See OiraPasskeyPlugin.java.
 *
 * The WebView refuses WebAuthn for pages served from inside the APK, so in the app the same
 * request goes to Android instead. These two functions take exactly what custody.ts would have
 * given navigator.credentials, send it as WebAuthn JSON, and hand back an object with the two
 * things custody.ts reads off a credential: its rawId and its extension results (the PRF output).
 * On the web they are the browser's own calls, untouched. */

interface OiraPasskey {
  create(o: { request: string }): Promise<{ response: string }>;
  get(o: { request: string }): Promise<{ response: string }>;
}
const plugin = registerPlugin<OiraPasskey>('OiraPasskey');

/* What custody.ts uses from a credential. A real PublicKeyCredential satisfies it on the web. */
export interface PasskeyResult {
  rawId: ArrayBuffer;
  getClientExtensionResults(): AuthenticationExtensionsClientOutputs;
}

const isBytes = (v: unknown): v is ArrayBuffer | ArrayBufferView =>
  v instanceof ArrayBuffer || ArrayBuffer.isView(v);

/* WebAuthn options to WebAuthn JSON: every byte field becomes base64url. `hints` is left out,
   since it only steers a browser's own chooser and Credential Manager has none. */
function toJson(v: unknown): unknown {
  if (isBytes(v)) return b64.bufToUrl(v instanceof ArrayBuffer ? v : new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  if (Array.isArray(v)) return v.map(toJson);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (k !== 'hints' && x !== undefined) out[k] = toJson(x);
    return out;
  }
  return v;
}

const toBuf = (s: string): ArrayBuffer => {
  const u = b64.urlToBuf(s);
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
};

function fromJson(json: string): PasskeyResult {
  const r = JSON.parse(json) as { rawId?: string; id?: string; clientExtensionResults?: { prf?: { enabled?: boolean; results?: { first?: string } } } };
  const prf = r.clientExtensionResults?.prf;
  const ext = prf
    ? { prf: { ...(prf.enabled !== undefined ? { enabled: prf.enabled } : {}), ...(prf.results?.first ? { results: { first: toBuf(prf.results.first) } } : {}) } }
    : {};
  return {
    rawId: toBuf(r.rawId || r.id || ''),
    getClientExtensionResults: () => ext as AuthenticationExtensionsClientOutputs,
  };
}

/* Android's refusals arrive as codes like TYPE_CREATE_CREDENTIAL_CANCELLATION_EXCEPTION. They are
   thrown as NotAllowedError, the name the browser uses for the same moments, so custody.ts handles
   both the same way. */
function refusal(e: unknown): Error {
  const x = e as { code?: string; message?: string };
  const err = new Error(`${x?.code || 'refused'}: ${x?.message || ''}`.trim());
  err.name = 'NotAllowedError';
  return err;
}

export async function passkeyCreate(publicKey: PublicKeyCredentialCreationOptions): Promise<PasskeyResult | null> {
  if (!isNativeApp()) return (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  try {
    const { response } = await plugin.create({ request: JSON.stringify(toJson(publicKey)) });
    return fromJson(response);
  } catch (e) { throw refusal(e); }
}

export async function passkeyGet(publicKey: PublicKeyCredentialRequestOptions): Promise<PasskeyResult | null> {
  if (!isNativeApp()) return (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  try {
    const { response } = await plugin.get({ request: JSON.stringify(toJson(publicKey)) });
    return fromJson(response);
  } catch (e) { throw refusal(e); }
}
