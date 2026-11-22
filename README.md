# GlowRow

GlowRow is an offline corner-to-corner (C2C) crochet companion for Android and Fire tablets. It shows just the diagonal you’re working on in color and blacks out the rest. You can see your current row, total rows, and the stitch colors in working order.

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
- Patterns, stitch colors, and progress stay on this device. No account, server, advertising, or network permission. Uninstalling or clearing app data deletes local patterns and progress.

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
