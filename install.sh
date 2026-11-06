#!/usr/bin/env bash
# Pi Metrics - Linux Desktop Installation Script
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"

echo "🍓 Installing Pi Metrics Desktop App..."

# 1. Build frontend if dist does not exist
if [ ! -d "$DIR/dist" ]; then
    echo "Building dashboard frontend..."
    (cd "$DIR" && npm install && npm run build)
fi

# 2. Install executable launcher to ~/.local/bin
mkdir -p "$BIN_DIR"
cat << EOF > "$BIN_DIR/pi-metrics"
#!/usr/bin/env bash
exec /usr/bin/python3 "$DIR/app.py" "\$@"
EOF
chmod +x "$BIN_DIR/pi-metrics"
echo "✓ Installed launcher: $BIN_DIR/pi-metrics"

# 3. Install icons to ~/.local/share/icons/hicolor
mkdir -p "$ICON_DIR/scalable/apps"
cp "$DIR/assets/pi-metrics.svg" "$ICON_DIR/scalable/apps/pi-metrics.svg"

for sz in 16 24 32 48 64 128 256 512; do
    if [ -f "$DIR/assets/icons/pi-metrics-$sz.png" ]; then
        mkdir -p "$ICON_DIR/${sz}x${sz}/apps"
        cp "$DIR/assets/icons/pi-metrics-$sz.png" "$ICON_DIR/${sz}x${sz}/apps/pi-metrics.png"
    fi
done
echo "✓ Installed application icons to $ICON_DIR"

# 4. Install Desktop Entries
mkdir -p "$APP_DIR"
cp "$DIR/pi-metrics.desktop" "$APP_DIR/pi-metrics.desktop"
chmod +x "$APP_DIR/pi-metrics.desktop"

if [ -d "$DESKTOP_DIR" ]; then
    cp "$DIR/pi-metrics.desktop" "$DESKTOP_DIR/Pi Metrics.desktop"
    chmod +x "$DESKTOP_DIR/Pi Metrics.desktop"
    gio set "$DESKTOP_DIR/Pi Metrics.desktop" metadata::trusted true 2>/dev/null || true
    echo "✓ Installed desktop shortcut: $DESKTOP_DIR/Pi Metrics.desktop"
fi

# 5. Update system caches
update-desktop-database "$APP_DIR" 2>/dev/null || true
gtk-update-icon-cache -f -t "$ICON_DIR" 2>/dev/null || true

echo "✨ Pi Metrics installed successfully! You can launch it with 'pi-metrics' or from your Desktop."
