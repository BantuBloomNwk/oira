# Privacy Policy

_Last updated: [DATE]. This is a working draft prepared by the founders. It is written to describe how
Oira actually handles data today. Have it reviewed by qualified counsel in each region where you
operate before you publish it or rely on it. Items in [BRACKETS] must be finalised._

## 1. Who we are

Oira ("Oira", the "Service") is operated jointly by **BantuBloom Network** and **Aurora K** (together,
"we", "us", "our"). You can reach us at **info@myoira.com** for any question about this policy or your
data.

Oira is built for women everywhere, with particular attention to the Global South. Wherever you use
it, we apply the same commitment to keeping your information yours.

[Counsel to confirm: BantuBloom Network is not yet incorporated, so the contracting party and data
controller of record must be settled — likely Aurora K and/or the founders personally until BantuBloom
Network is registered. Name that entity here and identify any EU/UK controller and representative if
required.]

## 2. The idea behind this policy

Oira was designed so that we hold as little of your information as possible. Most of what you do in
Oira stays on your own phone, and the one thing people worry about most — your face — never leaves it.
The sections below set out precisely what we mean.

## 3. Information that never leaves your device

The following is stored only in your device's local storage and is readable only by you. We do not
receive it, and we keep no copy:

(a) the photograph and camera frames captured during a reading. These are analysed on your device and
    reduced to a small set of coarse values (your undertone, a depth number and a season). The
    photograph itself is then discarded;

(b) any profile photograph or name you choose to add;

(c) your skin-condition log and your colour-check history;

(d) your preferences, including language, notifications, reminders, voice setting, and your response to
    the optional prompt asking whether you might one day wish to share your skin history with a
    professional;

(e) the material used to sign you in — a reference to your passkey (the passkey itself is held by your
    operating system, such as iCloud Keychain or Google Password Manager, not by us), or, on a device
    without a passkey, a local recovery key; and

(f) a cached copy of your public wallet address and any on-device assistant text.

You may delete all of the above at any time from the app's Settings ("Reset this device"), or by
clearing the app's storage or uninstalling it.

## 4. Information that leaves your device

Only the following leaves your device, and only to provide the feature you are using:

(a) your coarse palette values (undertone, depth and season). These are transmitted to a hardware-based
    secure enclave (a Trusted Execution Environment) that seals them. What is recorded on the public
    blockchain is an encrypted record together with cryptographic commitments and hashes — not your
    readable traits;

(b) your public wallet address and the blockchain transactions you carry out. By the nature of a public
    blockchain, these are visible to anyone and cannot later be erased; and

(c) if, and only if, you turn on the server voice option, the audio you record, which is sent for
    transcription into text. With the on-device voice option, your audio does not leave your phone. You
    choose which option is active.

We do not receive your photograph, your device's secret key, your on-device skin log, or your saved
name or profile photograph.

## 5. Information we receive automatically

To deliver the app and carry out blockchain requests, our infrastructure providers necessarily receive
ordinary technical data such as your IP address and request metadata. We do not use this to build a
profile of you, and Oira runs no advertising or analytics trackers of any kind.

## 6. How we use information

We use the limited information described above to provide your reading and palette; to show your
on-device skin insights; to seal your palette privately and allow brands to check, without learning
your identity or your traits, whether an offer they have funded matches you; to transcribe your voice
if you have enabled that option; and to keep the Service secure and functioning. We do not sell your
information, share it for advertising, or use it to train models on your identity.

## 7. Service providers

Oira relies on the providers below. Each receives only what it needs to perform its function:

- **Solana (test network) and a remote-procedure-call proxy (Helius, delivered through a Supabase edge
  function):** to read from and write to the blockchain. These see your public address and public
  transaction data.
- **MagicBlock (Ephemeral Rollup / Trusted Execution Environment):** the secure enclave that seals your
  palette and performs private matching. Your data is processed inside the enclave; the public chain
  sees only its encrypted and hashed output.
- **The Oira bridge (our self-hosted server):** relays your seal, submits transactions, and pays the
  network fee on your behalf. It sees your public address and the messages you sign on your device; it
  never receives your secret key.
- **Netlify:** hosts the application and receives ordinary hosting request data.
- **Google Fonts:** provides fonts and may receive your IP address when a font loads.
- **On-device face model (TensorFlow.js / BlazeFace):** detects a face during a reading, on your
  device. The model file is loaded from a content-delivery network; your camera frames are not sent to
  it.
- **Speech-to-text provider (self-hosted Whisper / RunPod), used only if you enable server voice:**
  receives the audio you record for that feature.

[Confirm this list before publishing and update it whenever a provider changes. Link each provider's
own privacy policy.]

## 8. Retention

Information held on your device remains until you delete it. Information recorded on the blockchain is,
by the nature of that technology, permanent and public, although it takes the form of encrypted records
and commitments rather than your readable traits. We do not keep server-side copies of your readings,
skin log, name or profile photograph.

## 9. Your rights and choices

Because most of your information never leaves your device, you control it directly: you can view it in
the app, and you can delete it through Settings, by clearing storage, or by uninstalling. You can keep
voice audio on your device by leaving the server voice option off.

Depending on where you live, you may also have statutory rights over your personal data — for example,
under the EU and UK General Data Protection Regulation, and under the data-protection laws of the
countries in which we operate — including rights of access, correction, deletion, objection and
portability, and the right to complain to your data-protection authority. To exercise any of these,
write to us at info@myoira.com. Please note that records on a public blockchain cannot be deleted, as
explained in section 8.

[Counsel to confirm lawful basis, controller/processor roles, and cross-border transfer mechanisms for
each launch region. West Africa counsel is engaged; other regions are being arranged.]

## 10. Children

Oira is not directed to children under [16 / 18], and we do not knowingly collect their information. If
you believe a child has used Oira, please contact us and we will assist.

## 11. Security

Your sign-in key is created and used on your own device, protected by your passkey or biometrics, and
your palette is sealed inside a hardware-based secure enclave; we never hold your secret key. No system
is completely secure, and Oira is beta software running on a test network. Please do not use it for
information or value you cannot afford to lose.

## 12. A note on health

Oira's skin insights and trends, and any suggestion that something may be "worth mentioning to a
professional", are provided as general wellness information. They are not medical advice, diagnosis or
screening, and they do not replace a qualified professional. If you have a health concern, please
consult a licensed practitioner.

## 13. Changes to this policy

We will update this policy as Oira develops — for example, when it moves from the test network to the
main network, or introduces paid features — and we will record the new date above.

## 14. Contact

Questions about this policy or your information may be sent to **info@myoira.com**, addressed to
BantuBloom Network and Aurora K. [Add the postal address and, where required, the EU/UK
representative or data-protection officer.]
