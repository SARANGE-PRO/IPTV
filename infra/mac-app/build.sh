#!/bin/bash
# Construit IPTV.app (coquille Mac native). Usage :
#   ./build.sh                                  # URL par défaut
#   APP_URL=http://192.168.1.10/ ./build.sh     # autre coquille HTTP
set -euo pipefail
cd "$(dirname "$0")"

APP_URL="${APP_URL:-http://zibtv.duckdns.org/}"
OUT="build/IPTV.app"
ICON_SRC="../../public/icons/icon-512.png"

rm -rf build && mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources"

swiftc -O -o "$OUT/Contents/MacOS/IPTV" main.swift \
  -framework AppKit -framework WebKit -target arm64-apple-macos13.0

# Icône : jeu de tailles depuis le PNG 512 de la PWA.
ICONSET="build/IPTV.iconset"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$ICON_SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2)); [ $d -le 512 ] && \
    sips -z $d $d "$ICON_SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$OUT/Contents/Resources/AppIcon.icns"

cat > "$OUT/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>IPTV</string>
  <key>CFBundleDisplayName</key><string>IPTV</string>
  <key>CFBundleIdentifier</key><string>fr.sarange.iptv</string>
  <key>CFBundleExecutable</key><string>IPTV</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.entertainment</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>IPTVAppURL</key><string>${APP_URL}</string>
  <key>NSAppTransportSecurity</key><dict>
    <key>NSAllowsArbitraryLoads</key><true/>
    <key>NSAllowsArbitraryLoadsInWebContent</key><true/>
  </dict>
</dict></plist>
PLIST

# Signature ad hoc (suffisante pour un usage local).
codesign --force --deep --sign - "$OUT"
echo "OK → $(pwd)/$OUT"
