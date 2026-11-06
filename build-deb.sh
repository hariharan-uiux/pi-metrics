#!/usr/bin/env bash
# Pi Metrics - Debian / Ubuntu (.deb) Package Builder
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION=$(python3 -c "import json; print(json.load(open('$DIR/package.json')).get('version', '1.0.1'))")
BUILD_DIR="/tmp/pi-metrics-deb-build"
PKG_DIR="$BUILD_DIR/pi-metrics_${VERSION}_all"
DEB_NAME="pi-metrics_${VERSION}_all.deb"

echo "🍓 Building Debian package: $DEB_NAME..."

# 1. Build frontend if needed
if [ ! -d "$DIR/dist" ]; then
    echo "Building frontend..."
    (cd "$DIR" && npm install && npm run build)
fi

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$PKG_DIR/DEBIAN"
mkdir -p "$PKG_DIR/usr/bin"
mkdir -p "$PKG_DIR/usr/share/pi-metrics"
mkdir -p "$PKG_DIR/usr/share/applications"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/scalable/apps"

# 2. Control file
cat << EOF > "$PKG_DIR/DEBIAN/control"
Package: pi-metrics
Version: $VERSION
Section: utils
Priority: optional
Architecture: all
Depends: python3, python3-gi, gir1.2-gtk-3.0, gir1.2-webkit2-4.1
Maintainer: HariHaran <haridhina3051@gmail.com>
Homepage: https://github.com/hariharan-uiux/pi-metrics
Description: Real-time Raspberry Pi 5 hardware telemetry dashboard and Linux desktop application
 A standalone hardware monitoring desktop application for Raspberry Pi 5.
 Features CPU, memory, disk, network, SoC temperature telemetry, and interactive
 charts built with GTK3, WebKit2, React, Tailwind CSS, and shadcn/ui.
EOF

# 3. Postinst script
cat << 'EOF' > "$PKG_DIR/DEBIAN/postinst"
#!/bin/sh
set -e
if [ "$1" = "configure" ]; then
    update-desktop-database -q /usr/share/applications || true
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi
exit 0
EOF
chmod 755 "$PKG_DIR/DEBIAN/postinst"

# 4. Prerm script
cat << 'EOF' > "$PKG_DIR/DEBIAN/prerm"
#!/bin/sh
set -e
pkill -f "/usr/share/pi-metrics/server.py" 2>/dev/null || true
exit 0
EOF
chmod 755 "$PKG_DIR/DEBIAN/prerm"

# 5. Application files
cp "$DIR/app.py" "$PKG_DIR/usr/share/pi-metrics/"
cp "$DIR/server.py" "$PKG_DIR/usr/share/pi-metrics/"
cp "$DIR/cli.py" "$PKG_DIR/usr/share/pi-metrics/"
cp "$DIR/config.json" "$PKG_DIR/usr/share/pi-metrics/"
cp "$DIR/start.sh" "$PKG_DIR/usr/share/pi-metrics/"
cp "$DIR/LICENSE" "$PKG_DIR/usr/share/pi-metrics/"
cp "$DIR/README.md" "$PKG_DIR/usr/share/pi-metrics/"
cp -r "$DIR/dist" "$PKG_DIR/usr/share/pi-metrics/"
cp -r "$DIR/assets" "$PKG_DIR/usr/share/pi-metrics/"

# 6. Launcher
cat << 'EOF' > "$PKG_DIR/usr/bin/pi-metrics"
#!/usr/bin/env bash
exec /usr/bin/python3 /usr/share/pi-metrics/app.py "$@"
EOF
chmod 755 "$PKG_DIR/usr/bin/pi-metrics"

# 7. Desktop entry
cat << 'EOF' > "$PKG_DIR/usr/share/applications/pi-metrics.desktop"
[Desktop Entry]
Version=1.0
Type=Application
Name=Pi Metrics
GenericName=Raspberry Pi Hardware Monitor
Comment=Real-time Raspberry Pi 5 Hardware Telemetry & Dashboard
Exec=/usr/bin/pi-metrics
Icon=pi-metrics
Terminal=false
Categories=GNOME;GTK;System;Monitor;
StartupWMClass=pi-metrics
Keywords=raspberry;pi;metrics;monitor;hardware;ssh;telemetry;
Actions=SSH;Web;Stop;

[Desktop Action SSH]
Name=Open SSH Terminal
Exec=/usr/share/pi-metrics/start.sh --terminal

[Desktop Action Web]
Name=Open in Browser
Exec=/usr/bin/xdg-open http://localhost:5055

[Desktop Action Stop]
Name=Stop Pi Metrics Server
Exec=/usr/share/pi-metrics/start.sh --stop
EOF
chmod 644 "$PKG_DIR/usr/share/applications/pi-metrics.desktop"

# 8. Icons
cp "$DIR/assets/pi-metrics.svg" "$PKG_DIR/usr/share/icons/hicolor/scalable/apps/"
for sz in 16 24 32 48 64 128 256 512; do
    if [ -f "$DIR/assets/icons/pi-metrics-$sz.png" ]; then
        mkdir -p "$PKG_DIR/usr/share/icons/hicolor/${sz}x${sz}/apps"
        cp "$DIR/assets/icons/pi-metrics-$sz.png" "$PKG_DIR/usr/share/icons/hicolor/${sz}x${sz}/apps/pi-metrics.png"
    fi
done

# 9. Build package
dpkg-deb --build --root-owner-group "$PKG_DIR" "$DIR/$DEB_NAME"
rm -rf "$BUILD_DIR"

echo "✨ Package created successfully: $DIR/$DEB_NAME"
