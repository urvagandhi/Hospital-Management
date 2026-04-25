# HMS Android — Upload Keystore Setup

Operator runbook for generating the Play Store upload keystore for the HMS Android app. Follow this end-to-end before the first Play Console upload.

Cross-references:
- Tech debt ticket: [`docs/audit/06-tech-debt-ledger.md`](../docs/audit/06-tech-debt-ledger.md) TD-A01
- Pre-Play-Store checklist: [`CLAUDE.md`](../CLAUDE.md) section 11

## Status snapshot (2026-04-25)

| Step | Status |
| --- | --- |
| 1. Generate keystore | ✅ done — `~/.android/keystores/hms-upload.jks` (alias `hms-upload`, RSA 2048, validity 10000d, DN `CN=Urva Gandhi, OU=HMS, O=AppicLogics, L=Ahmedabad, ST=Gujarat, C=IN`) |
| 2. Move keystore outside repo + chmod 600 | ✅ done |
| 3. Populate `~/.gradle/gradle.properties` with real password | ✅ done (chmod 600, NOT in repo) |
| 4. `app/build.gradle` reads creds from env / gradle props, fails closed otherwise | ✅ done (TD-A01 shipped) |
| 5. **Backup** keystore + password to 2 secure locations (1Password + offline drive) | ⏳ **operator action pending** |
| 6. First `./gradlew assembleRelease` with the new key + verify cert DN | ⏳ pending |
| 7. Enable Play App Signing on the Play Console listing (paste SHA-256 fingerprint) | ⏳ pending Play listing creation |

**SHA-256 fingerprint** of the upload key (paste into Play Console for App Signing verification):

```text
BC:35:8B:64:41:0C:3A:01:FF:A6:3A:49:F4:3C:37:92:9C:A3:42:53:61:BF:AA:69:C2:6A:3E:62:E4:C8:C3:50
```

## 1. Why

The repo has been signing release builds with the Android `debug.keystore` (alias `androiddebugkey`). That keystore ships with the Android SDK, its password is `android`, and Google Play rejects any APK signed with it. We are replacing it with a dedicated upload key. Treat this key as irreplaceable: if you lose it and have not enabled Play App Signing, you can never publish an update to the same Play listing — you will have to fork to a new package name and lose every install.

## 2. Generate the keystore

Run from anywhere outside the repo (the keystore must not live inside the working tree):

```bash
keytool -genkey -v \
  -keystore hms-upload.jks \
  -alias hms-upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

`-validity 10000` is roughly 27 years. Play recommends at least 25 years so the upload cert outlives the listing.

`keytool` will prompt for a keystore password, a key password (use the same for both unless you have a reason not to), and a Distinguished Name (CN, OU, O, L, ST, C). The CN is what `apksigner verify --print-certs` will display later — use something recognisable like `HMS Upload Key`.

## 3. Store credentials safely

Pick one of the two paths below. Do **not** commit credentials to the repo, and do **not** put them in `android-app/gradle.properties` (that file is tracked).

### Option A — `~/.gradle/gradle.properties` (user-level, recommended for local dev)

Append to `~/.gradle/gradle.properties` (create it if it does not exist):

```properties
hmsUploadKeystorePwd=<keystore-password>
hmsUploadKeyPwd=<key-password>
```

This file is per-user and outside the repo, so it is never staged.

### Option B — OS environment variables (recommended for CI)

```bash
export HMS_UPLOAD_KEYSTORE_PWD='<keystore-password>'
export HMS_UPLOAD_KEY_PWD='<key-password>'
```

Add these to your CI secret store (GitHub Actions secrets, etc.) — never to a checked-in shell profile.

`app/build.gradle` reads either source and **fails the release build** if neither is present. There is no silent fallback to the debug keystore.

## 4. Set the keystore path

Tell Gradle where the keystore lives via an absolute path env var:

```bash
export HMS_UPLOAD_KEYSTORE_PATH=/absolute/path/to/hms-upload.jks
```

Keep the file outside the repo. The root `.gitignore` already blocks `*.keystore` and `*.jks`, but a path inside the repo is still a footgun — a stray `git add -f` would commit it.

## 5. Back it up

Store the `.jks` file in **two** secure locations before you ever upload to Play. Examples:
- 1Password (or your team's password manager) as a file attachment alongside the passwords.
- An encrypted external drive kept offline.

Losing this key — and not having Play App Signing enabled — is the single most catastrophic operational loss possible for this app: there is no recovery, only a forked Play listing under a new package name and a forced reinstall for every existing user.

## 6. Verify

From `android-app/`:

```bash
./gradlew assembleRelease
```

Then verify the resulting APK is signed with the new cert (not the debug key):

```bash
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

Expected output: a `Signer #1 certificate DN:` line whose CN matches what you typed during `keytool -genkey`. If you see `CN=Android Debug, O=Android, C=US` or alias `androiddebugkey`, the build is still using the debug keystore — re-check the env vars are exported in the shell that ran Gradle.

## 7. Enable Play App Signing

When you create the Play Console listing, opt into **Play App Signing**. Google generates and holds a managed release key; your upload key is used only to authenticate uploads. Benefits:
- If the upload key is lost or compromised, Play has a key-reset flow — only available because App Signing was on.
- Google can re-sign per-device-optimised APKs from your `.aab` bundle.

Prefer uploading `.aab` (App Bundle) over `.apk`:

```bash
./gradlew bundleRelease
# output: app/build/outputs/bundle/release/app-release.aab
```

After each release, upload `app/build/outputs/mapping/release/mapping.txt` to Play Console so crash reports are de-obfuscated.

## 8. Common failures

- **`Failed to read key hms-upload from store`** — wrong key password (`HMS_UPLOAD_KEY_PWD` / `hmsUploadKeyPwd`). Re-export and rerun.
- **`Keystore was tampered with, or password was incorrect`** — wrong keystore password (`HMS_UPLOAD_KEYSTORE_PWD` / `hmsUploadKeystorePwd`), or the file at `HMS_UPLOAD_KEYSTORE_PATH` is not the one whose password you have.
- **Gradle error `HMS_UPLOAD_KEYSTORE_PATH is not set`** — env var unset in the current shell. `export` it (or set it via your CI's secret manager) and rerun. Re-sourcing `~/.gradle/gradle.properties` does not help — the path is read from the environment, not from gradle.properties.
- **Release APK still shows `androiddebugkey`** — env vars were not visible to the Gradle daemon. Run `./gradlew --stop` to kill the daemon, re-export the vars, and rerun `assembleRelease`.

---

After completing steps 1–7, mark TD-A01 as resolved in [`docs/audit/06-tech-debt-ledger.md`](../docs/audit/06-tech-debt-ledger.md) and tick the keystore items in the pre-Play-Store checklist in [`CLAUDE.md`](../CLAUDE.md) section 11.
