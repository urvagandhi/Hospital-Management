#!/usr/bin/env bash
# MediVault - Android Fast Build (Linux/macOS)
# Builds a debug APK as fast as possible using Gradle optimizations.

set -euo pipefail

cd "$(dirname "$0")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

MODE="${1:-debug}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# --- Preflight checks ---

if ! command -v java &>/dev/null; then
    echo -e "${RED}Error: Java not found. Install JDK 17.${NC}"
    exit 1
fi

JAVA_VER=$(java -version 2>&1 | head -1)
echo "Java: $JAVA_VER"

if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
    # Try common locations
    for candidate in "$HOME/Android/Sdk" "$HOME/Library/Android/sdk" "/usr/local/lib/android/sdk"; do
        if [ -d "$candidate" ]; then
            export ANDROID_HOME="$candidate"
            break
        fi
    done
    if [ -z "${ANDROID_HOME:-}" ]; then
        echo -e "${YELLOW}Warning: ANDROID_HOME not set. Gradle may fail if SDK is not found.${NC}"
    fi
fi

echo "ANDROID_HOME: ${ANDROID_HOME:-not set}"

# --- Ensure gradlew is executable ---
chmod +x gradlew

# --- Build ---

GRADLE_OPTS=(
    --parallel
    --build-cache
    --configure-on-demand
    -Dorg.gradle.daemon=true
    -Dorg.gradle.caching=true
)

case "$MODE" in
    debug)
        echo ""
        echo "-- Fast debug build --"
        ./gradlew assembleDebug "${GRADLE_OPTS[@]}"
        SRC_PATH="app/build/outputs/apk/debug/app-debug.apk"
        APK_PATH="app/build/outputs/apk/debug/MediVault_${TIMESTAMP}.apk"
        ;;
    release)
        echo ""
        echo "-- Release build --"
        ./gradlew assembleRelease "${GRADLE_OPTS[@]}"
        SRC_PATH="app/build/outputs/apk/release/app-release.apk"
        APK_PATH="app/build/outputs/apk/release/MediVault_${TIMESTAMP}.apk"
        ;;
    clean)
        echo ""
        echo "-- Clean + debug build --"
        ./gradlew clean assembleDebug "${GRADLE_OPTS[@]}"
        SRC_PATH="app/build/outputs/apk/debug/app-debug.apk"
        APK_PATH="app/build/outputs/apk/debug/MediVault_${TIMESTAMP}.apk"
        ;;
    bundle)
        echo ""
        echo "-- App bundle (AAB) build --"
        ./gradlew bundleRelease "${GRADLE_OPTS[@]}"
        SRC_PATH="app/build/outputs/bundle/release/app-release.aab"
        APK_PATH="app/build/outputs/bundle/release/MediVault_${TIMESTAMP}.aab"
        ;;
    *)
        echo "Usage: ./build-apk.sh [debug|release|clean|bundle]"
        echo ""
        echo "  debug    Fast debug APK (default)"
        echo "  release  Minified release APK"
        echo "  clean    Clean then debug build"
        echo "  bundle   Release AAB for Play Store"
        exit 1
        ;;
esac

echo ""
if [ -f "$SRC_PATH" ]; then
    mv "$SRC_PATH" "$APK_PATH"
fi
if [ -f "$APK_PATH" ]; then
    SIZE=$(du -h "$APK_PATH" | cut -f1)
    echo -e "${GREEN}BUILD SUCCESSFUL${NC}"
    echo "Output: $APK_PATH ($SIZE)"

    # Offer to install on connected device
    if command -v adb &>/dev/null && [ "$MODE" = "debug" ]; then
        DEVICES=$(adb devices 2>/dev/null | grep -c 'device$' || true)
        if [ "$DEVICES" -gt 0 ]; then
            echo ""
            echo -e "${GREEN}Device detected.${NC} Installing..."
            adb install -r "$APK_PATH"
            echo -e "${GREEN}Installed on device.${NC}"
        fi
    fi
else
    echo -e "${RED}BUILD FAILED - APK not found at $APK_PATH${NC}"
    exit 1
fi
