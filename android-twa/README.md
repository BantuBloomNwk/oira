# Oira Android app (TWA)

The Android app is a Trusted Web Activity wrapper around the live PWA. It carries no app logic of its
own: it loads `https://app.myoira.com`, so **every web deploy is picked up automatically** and the APK
almost never needs rebuilding. The one time it does is if the target URL or signing key changes.

`twa-manifest.json` here is the reproducible build config (package `app.oira.twa`, host `app.myoira.com`).
It is the only build input kept in git. The generated Gradle project, the APK/AAB, and, above all, the
**signing keystore are deliberately NOT in git** (see `.gitignore`).

## Signing key (do not lose this)
- Keystore: `oira-release.keystore`, alias `oira`. SHA-256 fingerprint
  `F0:03:9D:FD:9D:9E:B8:B5:63:CF:CA:82:53:B4:1B:AA:9B:14:16:03:FA:8B:12:98:67:45:46:03:FE:8C:41:AD`.
- This fingerprint is what `app.myoira.com/.well-known/assetlinks.json` trusts, and what makes a rebuild
  install as an **update** over the installed app (rather than a conflicting new app). Lose it and you can
  never update the installed app again.
- Live copy: on the build machine at `~/oira-seeker-keystore/` (keystore + password file). Encrypted
  off-machine backup: on the VPS at `/opt/oira/backups/oira-keystore-backup.tar.gz.enc` (passphrase held
  separately by the founder). Also copy the raw keystore + password into a password manager.

## Rebuild (only if the URL or key changes)
Needs a JDK 17 + the Android SDK (build-tools + platform). Bubblewrap scaffolds the Gradle project;
sign with `apksigner` directly (the interactive Bubblewrap signing step is flaky under non-interactive
shells).

```
# 1. scaffold/refresh the Gradle project from this manifest (bumps versionCode)
bubblewrap update           # answer versionName + versionCode when prompted

# 2. build the unsigned release APK
export JAVA_HOME=<jdk17>  ANDROID_HOME=<android-sdk>
./gradlew assembleRelease --no-daemon

# 3. align + sign with the release keystore
BT=$ANDROID_HOME/build-tools/35.0.0
"$BT/zipalign" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk aligned.apk
"$BT/apksigner" sign --ks oira-release.keystore --ks-key-alias oira --out oira-seeker.apk aligned.apk

# 4. confirm the fingerprint matches the one above (else it won't update the installed app)
"$BT/apksigner" verify --print-certs oira-seeker.apk
```

The signed APK ships as `landing/downloads/oira-seeker.apk` (the "Download for Seeker (.apk)" link on
myoira.com). Bump `appVersionCode` on every rebuild so it installs as an update.
