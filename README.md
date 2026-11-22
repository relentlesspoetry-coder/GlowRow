# GlowRow

GlowRow is an offline corner-to-corner (C2C) crochet companion for Android and Fire tablets. The whole pattern stays visible but faded, with the diagonal you’re working on shown in full color. You can see your current row, total rows, and the stitch colors in working order.

## Install on an Android or Fire tablet

1. Download **GlowRow.apk** from this repository’s Releases page.
2. Open the downloaded file. If the tablet blocks installation, Fire OS or Android may ask you to allow the browser or Files app to install this download. You can turn that setting off again after installation.
3. Open GlowRow and try the bundled Mint Diamond pattern.

Requires Android 8.0 (API 26) or a compatible Fire OS version and an enabled system WebView. Individual Fire tablet models have not been certified.

## Use it

- Tap **Patterns → Add a pattern** and choose an image using the tablet’s picker.
- For a chart screenshot, crop to the chart and enter the actual number of squares across and down. Toggle **Image contains printed grid lines** to sample inside the squares.
- In **Settings**, choose the same starting corner you’re using for your crochet piece.
- Use **Next**, **Previous**, or swipe the grid. Tap the row counter to jump to a specific row.
- Patterns, stitch colors, and progress stay on this device. No account or advertising. The viewer and crochet work offline. Uninstalling or clearing app data deletes local patterns and progress.

## Build from source

The app is a self-contained HTML/Canvas viewer with a small native Android shell; no Gradle or JavaScript dependencies are needed.

Install JDK 17+, the Android SDK platform 35 and build-tools 35.0.0, and the `zip` utility. On Linux, point `ANDROID_HOME` at your SDK. Create or obtain your own PKCS12 APK signing key (alias `glowrow` by default), and back it up securely outside the checkout. Android updates require the same signer; a differently signed build cannot update an installed release in place.

```bash
export GLOWROW_KEYSTORE=/private/path/to/release.p12
read -rsp 'Keystore password: ' GLOWROW_STORE_PASS; echo
export GLOWROW_STORE_PASS
./scripts/build-apk.sh
unset GLOWROW_STORE_PASS
```

The script verifies signing and alignment and prints the SHA-256 of `dist/GlowRow.apk`. Run `node --test tests/viewer.test.cjs` for the offline viewer tests.

## Updates

If you installed v1.0.0, download the v1.1.0 `GlowRow.apk` from GitHub and open it on the tablet **without uninstalling GlowRow**. The app name, package, and signer are unchanged, so Android can upgrade it in place and keep your patterns.

From v1.1.0 onward, open **Settings → Check for updates**. The viewer stays offline; only this button uses the internet to check the public GlowRow GitHub repository. GlowRow asks before downloading, verifies the downloaded package and its release certificate, and hands it to Android’s installer. Android may first ask permission to install updates from GlowRow. You then approve or decline in Android’s own installer. There are no background checks or silent installations. If offline or rate-limited, wait and try again, or use the GitHub Releases page.

### Publishing an update

1. In `app/src/main/AndroidManifest.xml`, increase `android:versionCode` and set `android:versionName` to the new version.
2. Build and verify the APK with the **same release signing key**. Keep the private key and password out of Git, release attachments, and chat.
3. Attach the exact file `GlowRow.apk` to a **stable, published** release in `relentlesspoetry-coder/GlowRow` with the matching tag (for example, version `1.2.0` uses `v1.2.0`). Do not mark it as a prerelease or use a draft. No separate update service or GitHub credentials are needed by the app.

The updater’s standalone trust tests run with a JDK:

```bash
mkdir -p build/trust-tests
javac -d build/trust-tests app/src/main/java/com/glowrow/app/UpdateTrust.java tests/UpdateTrustTest.java
java -cp build/trust-tests com.glowrow.app.UpdateTrustTest
```

Optionally pass the release signing certificate (public DER only) to the test runner to exercise accepted packages and rejected downgrades, wrong package IDs, and wrong release tags.
