# GlowRow

GlowRow is an offline corner-to-corner (C2C) crochet companion for Android and Fire tablets. The whole pattern stays visible but faded, with the diagonal you’re working on shown in full color. You can see your current row, total rows, and the stitch colors in working order.

## Install on an Android or Fire tablet

1. Download **GlowRow.apk** from this repository’s Releases page.
2. Open the downloaded file and follow the tablet’s normal installation prompts. If the browser or tablet flags the file as harmful, stop instead of overriding the warning.
3. Open GlowRow and try the bundled Mint Diamond pattern.

Requires Android 8.0 (API 26) or a compatible Fire OS version and an enabled system WebView. Individual Fire tablet models have not been certified.

## Use it

- Tap **Patterns → Add a pattern** and choose an image using the tablet’s picker.
- Under **Original stitch grid**, choose **Image has grid lines: count them automatically** for a chart or screenshot. GlowRow can recover visible edge stitches when the outer line is clipped and there is enough grid evidence.
- Tap **Preview pattern** and check the original stitch count and colors. If the count is uncertain or doesn’t match, use **Enter the original stitch count myself**, and crop to the chart through **Crop image or adjust grid guides**. For plain pixel art, choose **No grid lines: enter the original stitch count**.
- The original stitch count and finished size are separate. After previewing the source, choose **Optional: add a border to reach a finished size** if you want one. Enter the finished width and height in stitches and choose a border yarn color. Confirm the resulting square count and colors, then select **Save pattern**. GlowRow saves only the finished version; border squares count as stitches.
- To center the active pattern inside a stitched border, open **Patterns → Add a border**. Enter the finished width and height in stitches and choose a yarn color. Check the preview, then tap **Save as new pattern**. The border counts as stitches, and the original pattern and its progress stay unchanged.
- New patterns start at **Bottom Right**. To change the starting corner, open **Settings**. GlowRow remembers your choice for future patterns and keeps each saved pattern’s own corner and progress.
- GlowRow fits the full grid to the screen in portrait and landscape, keeping the row counter and **Previous** / **Next** controls visible while you crochet. Tap the row counter to jump to a row, or swipe the grid to move one row at a time.
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

The script verifies signing and alignment and prints the SHA-256 of `dist/GlowRow.apk`. Run `node --test tests/*.test.cjs` for the offline viewer, grid import, and branding tests.

## Updates

If you already installed an older build, keep it installed to preserve your patterns. If your tablet permits the upgrade through its normal installation flow, open the current release APK without uninstalling GlowRow first. Do not turn off device protections or override a harmful-app warning.

From v1.1.1 onward, open **Settings → Check for updates**. Only this button uses the internet, to read release information from the public GlowRow repository. If an update is available, choose **Open GitHub** to see its release page in your browser. GlowRow itself does not download or install apps. The browser and tablet keep their normal download and installation checks. There are no background checks. If you are offline or GitHub is limiting requests, wait and try again. Continue crocheting offline any time.

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

These tests check version ordering, rejected tags, and the fixed official release-page destination.
