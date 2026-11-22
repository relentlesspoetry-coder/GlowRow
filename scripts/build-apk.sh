#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
source_dir=app/src/main
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
TOOLS=${GLOWROW_BUILD_TOOLS:-${SDK:?Set ANDROID_HOME or ANDROID_SDK_ROOT}/build-tools/35.0.0}
PLATFORM=${GLOWROW_ANDROID_JAR:-$SDK/platforms/android-35/android.jar}
OUT=${1:-dist/GlowRow.apk}
[[ "$OUT" = /* ]] || OUT="$PWD/$OUT"
KEYSTORE=${GLOWROW_KEYSTORE:?Set GLOWROW_KEYSTORE to a persistent private PKCS12 keystore path}
: "${GLOWROW_STORE_PASS:?Set GLOWROW_STORE_PASS}"
export GLOWROW_STORE_PASS
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$(dirname "$OUT")" "$scratch/classes" "$scratch/dex"

"$TOOLS/aapt2" compile --dir "$source_dir/res" -o "$scratch/resources.zip"
"$TOOLS/aapt2" link -I "$PLATFORM" --manifest "$source_dir/AndroidManifest.xml" \
    -A "$source_dir/assets" -o "$scratch/unsigned.apk" "$scratch/resources.zip"
mapfile -t sources < <(find "$source_dir/java" -type f -name "*.java" -print)
if [[ -n "${GLOWROW_ECJ_JAR:-}" ]]; then
    java -jar "$GLOWROW_ECJ_JAR" -source 8 -target 8 -nowarn -encoding UTF-8 -bootclasspath "$PLATFORM" \
        -d "$scratch/classes" "${sources[@]}"
else
    javac -source 8 -target 8 -encoding UTF-8 -bootclasspath "$PLATFORM" \
        -d "$scratch/classes" "${sources[@]}"
fi
mapfile -t classfiles < <(find "$scratch/classes" -type f -name '*.class' -print)
"$TOOLS/d8" --release --min-api 26 --lib "$PLATFORM" --output "$scratch/dex" "${classfiles[@]}"
(cd "$scratch/dex" && zip -q -0 "$scratch/unsigned.apk" classes.dex)
"$TOOLS/zipalign" -f 4 "$scratch/unsigned.apk" "$scratch/aligned.apk"
"$TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "${GLOWROW_KEY_ALIAS:-glowrow}" \
    --ks-pass env:GLOWROW_STORE_PASS --key-pass env:GLOWROW_STORE_PASS \
    --v4-signing-enabled false --out "$scratch/GlowRow.apk" "$scratch/aligned.apk"
"$TOOLS/apksigner" verify --verbose --print-certs "$scratch/GlowRow.apk"
"$TOOLS/zipalign" -c 4 "$scratch/GlowRow.apk"
cp "$scratch/GlowRow.apk" "$OUT"
sha256sum "$OUT"
