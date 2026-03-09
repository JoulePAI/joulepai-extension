#!/usr/bin/env bash
#
# JoulePAI Extension Build Script
#
# Produces:
#   dist/joulepai-chrome.zip   — Chrome Web Store ready
#   dist/joulepai-firefox.zip  — Firefox AMO ready
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

DIST_DIR="$SCRIPT_DIR/dist"
STAGE_DIR="$SCRIPT_DIR/.build-stage"

rm -rf "$DIST_DIR" "$STAGE_DIR"
mkdir -p "$DIST_DIR" "$STAGE_DIR"

# Common files (both builds)
COMMON=(
  manifest.json
  background/background.js
  content/content.js
  content/provider.js
  content/injected.js
  popup/popup.html
  popup/popup.js
  popup/popup.css
  styles/
  utils/
  icons/
)

# ── Stage common files ─────────────────────────────────────────
CHROME_DIR="$STAGE_DIR/chrome"
FIREFOX_DIR="$STAGE_DIR/firefox"
mkdir -p "$CHROME_DIR" "$FIREFOX_DIR"

for item in "${COMMON[@]}"; do
  if [ -d "$item" ]; then
    cp -r "$item" "$CHROME_DIR/$item"
    cp -r "$item" "$FIREFOX_DIR/$item"
  elif [ -f "$item" ]; then
    dir=$(dirname "$item")
    mkdir -p "$CHROME_DIR/$dir" "$FIREFOX_DIR/$dir"
    cp "$item" "$CHROME_DIR/$item"
    cp "$item" "$FIREFOX_DIR/$item"
  fi
done

# ── Chrome: uses compat.js (no polyfill) ──────────────────────
echo "Building Chrome extension..."
cp compat.js "$CHROME_DIR/compat.js"
(cd "$CHROME_DIR" && zip -r "$DIST_DIR/joulepai-chrome.zip" . -q)
echo "  -> dist/joulepai-chrome.zip"

# ── Firefox: uses browser-polyfill.min.js ─────────────────────
echo "Building Firefox extension..."

# Copy polyfill for Firefox
cp browser-polyfill.min.js "$FIREFOX_DIR/browser-polyfill.min.js"

# Firefox MV3: change service_worker to scripts array, add gecko settings,
# restore browser-polyfill.min.js in content_scripts and popup
python3 -c "
import json

with open('$FIREFOX_DIR/manifest.json') as f:
    m = json.load(f)

# Firefox MV3 uses 'scripts' instead of 'service_worker' for background
m['background'] = {
    'scripts': ['browser-polyfill.min.js', 'background/background.js'],
    'type': 'module'
}

# Restore polyfill in content_scripts (Chrome manifest has compat.js)
for cs in m.get('content_scripts', []):
    cs['js'] = ['browser-polyfill.min.js' if x == 'compat.js' else x for x in cs['js']]

# Add Firefox-specific settings
m['browser_specific_settings'] = {
    'gecko': {
        'id': 'joulepai-wallet@joulepai.ai',
        'strict_min_version': '109.0',
        'data_collection_permissions': {
            'required': ['none']
        }
    }
}

with open('$FIREFOX_DIR/manifest.json', 'w') as f:
    json.dump(m, f, indent=2)
    f.write('\n')
"

# Firefox popup.html: swap compat.js back to browser-polyfill.min.js
sed -i 's|../compat.js|../browser-polyfill.min.js|' "$FIREFOX_DIR/popup/popup.html"

# Firefox background.js: remove the Chrome shim (polyfill loaded via manifest scripts)
sed -i '/^\/\/ Cross-browser compatibility/,/^}$/d' "$FIREFOX_DIR/background/background.js"

(cd "$FIREFOX_DIR" && zip -r "$DIST_DIR/joulepai-firefox.zip" . -q)
echo "  -> dist/joulepai-firefox.zip"

# ── Cleanup ────────────────────────────────────────────────────
rm -rf "$STAGE_DIR"

echo ""
echo "Build complete:"
ls -lh "$DIST_DIR/"*.zip
