#!/usr/bin/env bash
set -e

echo "=== AURA LAN APK COMPILATION PIPELINE ==="
export ANDROID_HOME=/opt/android-sdk
mkdir -p "$ANDROID_HOME/cmdline-tools"

# Download cmdline-tools if not present
if [ ! -d "$ANDROID_HOME/cmdline-tools/latest" ]; then
    echo "Downloading Android Commandline Tools..."
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdline-tools.zip
    unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools
    mv /tmp/cmdline-tools/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
    rm -rf /tmp/cmdline-tools*
fi

export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "Accepting licenses & installing platform-tools, build-tools 34.0.0, platforms android-34..."
yes | sdkmanager --licenses > /dev/null 2>&1 || true
sdkmanager --install "platform-tools" "build-tools;34.0.0" "platforms;android-34" > /dev/null 2>&1

BUILD_TOOLS="$ANDROID_HOME/build-tools/34.0.0"
PLATFORM="$ANDROID_HOME/platforms/android-34"
WORK_DIR="/workspace/android/app/src/main"
BUILD_DIR="/tmp/apk_build"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/obj" "$BUILD_DIR/compiled"

echo "Compiling Android resources with aapt2..."
"$BUILD_TOOLS/aapt2" compile --dir "$WORK_DIR/res" -o "$BUILD_DIR/compiled/resources.zip"

echo "Linking resources with aapt2..."
"$BUILD_TOOLS/aapt2" link -I "$PLATFORM/android.jar" \
    --manifest "$WORK_DIR/AndroidManifest.xml" \
    -o "$BUILD_DIR/unaligned.apk" \
    "$BUILD_DIR/compiled/resources.zip" \
    --auto-add-overlay

echo "Compiling Java sources..."
javac -cp "$PLATFORM/android.jar" \
    -d "$BUILD_DIR/obj" \
    -source 17 -target 17 \
    "$WORK_DIR/java/com/auranexus/lan/MainActivity.java"

echo "Desugaring & converting classes to DEX with d8..."
"$BUILD_TOOLS/d8" --output "$BUILD_DIR" \
    --lib "$PLATFORM/android.jar" \
    "$BUILD_DIR/obj/com/auranexus/lan/MainActivity.class" \
    "$BUILD_DIR/obj/com/auranexus/lan/MainActivity\$"*.class 2>/dev/null || true

echo "Packaging classes.dex into APK..."
cd "$BUILD_DIR"
zip -uj unaligned.apk classes.dex

echo "Aligning APK with zipalign..."
"$BUILD_TOOLS/zipalign" -v -p 4 unaligned.apk aligned.apk

echo "Generating release keystore..."
keytool -genkey -v -keystore debug.keystore -alias debug -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass android -keypass android -dname "CN=Aura,OU=Aura,O=Aura,L=Istanbul,ST=Istanbul,C=TR"

echo "Signing APK with apksigner..."
"$BUILD_TOOLS/apksigner" sign --ks debug.keystore \
    --ks-pass pass:android --key-pass pass:android \
    --out /workspace/aura-lan.apk aligned.apk

echo "Verifying signed APK..."
"$BUILD_TOOLS/apksigner" verify --verbose /workspace/aura-lan.apk

echo "=== SUCCESS! APK built at /workspace/aura-lan.apk ==="
ls -lh /workspace/aura-lan.apk
