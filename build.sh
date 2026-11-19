#!/usr/bin/env bash
# Сборка APK без Android Studio/Gradle.
# Нужны: aapt, zipalign, apksigner, dalvik-exchange (dx), android-sdk-platform-23, JDK 17+.
#   sudo apt-get install -y aapt zipalign apksigner dalvik-exchange android-sdk-platform-23
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
OUT=build
DIST=dist
APK_NAME="PivnoyRayon.apk"
KEYSTORE=android/debug.keystore

rm -rf "$OUT"
mkdir -p "$OUT/assets/game" "$OUT/gen" "$OUT/classes" "$OUT/dex" "$DIST"

echo "== 1. Ассеты игры"
cp -r game/. "$OUT/assets/game/"

echo "== 2. Ресурсы и манифест (aapt)"
aapt package -f -m -0 arsc \
  -M android/AndroidManifest.xml \
  -S android/res \
  -A "$OUT/assets" \
  -I "$ANDROID_JAR" \
  -J "$OUT/gen" \
  -F "$OUT/app.unsigned.apk"

echo "== 3. Java -> class"
javac -nowarn -Xlint:-options -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR" \
  -d "$OUT/classes" \
  $(find "$OUT/gen" android/src -name '*.java')

echo "== 4. class -> dex"
dalvik-exchange --dex --min-sdk-version=21 --output="$OUT/dex/classes.dex" "$OUT/classes"
(cd "$OUT/dex" && aapt add ../app.unsigned.apk classes.dex >/dev/null)

echo "== 5. zipalign"
zipalign -f -p 4 "$OUT/app.unsigned.apk" "$OUT/app.aligned.apk"

echo "== 6. Подпись"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass android -keypass android \
    -alias pivnoy -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Pivnoy Rayon, O=Banana Studio, C=RU" >/dev/null 2>&1
fi
apksigner sign --v4-signing-enabled false --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias pivnoy --out "$DIST/$APK_NAME" "$OUT/app.aligned.apk"
apksigner verify "$DIST/$APK_NAME"

echo "== 7. Версия для браузера (один HTML-файл)"
python3 tools/inline_html.py game/index.html "$DIST/PivnoyRayon.html"

ls -la "$DIST"
echo "Готово: $DIST/$APK_NAME"
