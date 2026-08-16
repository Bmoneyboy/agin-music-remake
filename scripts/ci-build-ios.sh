#!/usr/bin/env bash
# Builds an unsigned .ipa. All output lands in out/ so the workflow can upload
# a single directory and stay free of multi-line YAML.
set -uo pipefail

mkdir -p out

finish() {
  local code=$1
  if [ -f xcodebuild.log ]; then
    cp xcodebuild.log out/ 2>/dev/null || true
    grep -vEi "warning:|note:" xcodebuild.log > out/xcodebuild-signal.log 2>/dev/null || true
  fi
  exit "$code"
}

echo "===== toolchain ====="
xcodebuild -version
swift --version
df -h /

echo "===== reclaiming disk ====="
KEEP=$(xcode-select -p | sed 's|/Contents/Developer||')
for app in /Applications/Xcode*.app; do
  if [ "$app" != "$KEEP" ]; then sudo rm -rf "$app"; fi
done
sudo rm -rf ~/Library/Developer/CoreSimulator/Caches
df -h /

echo "===== dependencies ====="
npm install --legacy-peer-deps --no-audit --no-fund || finish 1

echo "===== xcode 26 compatibility fixups ====="
# react-native-nitro-player (or its patch) declares the MTAudioProcessingTapCreate
# out-parameter as Unmanaged<MTAudioProcessingTap>?. The iOS 26 SDK audits that
# API and expects MTAudioProcessingTap? directly, so the build fails with:
#   cannot convert value of type 'Unmanaged<MTAudioProcessingTap>?'
#   to expected argument type 'MTAudioProcessingTap?'
# Applied here rather than via patch-package so the build does not depend on the
# patch file being up to date. Idempotent: a no-op if already correct.
EQ=node_modules/react-native-nitro-player/ios/equalizer/EqualizerCore.swift
if [ -f "$EQ" ]; then
  if grep -q 'var tap: Unmanaged<MTAudioProcessingTap>?' "$EQ"; then
    sed -i '' 's/var tap: Unmanaged<MTAudioProcessingTap>?/var tap: MTAudioProcessingTap?/' "$EQ"
    sed -i '' 's/tap?\.takeRetainedValue()/tap/' "$EQ"
    echo "applied MTAudioProcessingTap fixup"
  else
    echo "MTAudioProcessingTap already in audited form, nothing to do"
  fi
  grep -n "MTAudioProcessingTap?" "$EQ" | head -3
else
  echo "WARNING: $EQ not found"
fi

echo "===== prebuild ====="
export IOS_BUNDLE_ID="${IOS_BUNDLE_ID:-com.bmoney.aginmusic}"
echo "bundle id: $IOS_BUNDLE_ID"
npx expo prebuild --platform ios --clean || finish 1

WORKSPACE=$(find ios -maxdepth 1 -name '*.xcworkspace' | head -n1)
SCHEME=$(basename "$WORKSPACE" .xcworkspace)
echo "===== building $SCHEME ====="

xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  ONLY_ACTIVE_ARCH=NO \
  2>&1 | tee xcodebuild.log | xcbeautify
STATUS=${PIPESTATUS[0]}

if [ "$STATUS" -ne 0 ]; then
  echo "===== BUILD FAILED, extracting errors ====="
  df -h /
  grep -nEi "error:|BUILD FAILED|nonzero exit code|No space left|Killed|Segmentation" -A 5 xcodebuild.log | tail -n 150 || echo "no error markers found"
  finish "$STATUS"
fi

echo "===== packaging ====="
APP=$(find build/Build/Products/Release-iphoneos -maxdepth 1 -name '*.app' | head -n1)
echo "app: $APP"
mkdir -p Payload
cp -R "$APP" Payload/
zip -qry out/AginMusic-unsigned.ipa Payload
ls -lh out/

finish 0
