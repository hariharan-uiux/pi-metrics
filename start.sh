#!/usr/bin/env bash
# Pi Metrics - Launcher Script

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="/tmp/pi-metrics.pid"
PORT=5055

if [ "$1" == "--stop" ] || [ "$1" == "stop" ]; then
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            rm -f "$PID_FILE"
            echo "Pi Metrics server stopped (PID: $PID)."
            exit 0
        fi
    fi
    pkill -f "pi-metrics/server.py" 2>/dev/null || true
    echo "Pi Metrics stopped."
    exit 0
fi

if [ "$1" == "--status" ] || [ "$1" == "status" ]; then
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "Pi Metrics is running (PID: $(cat "$PID_FILE"), URL: http://localhost:$PORT)"
    else
        echo "Pi Metrics is stopped."
    fi
    exit 0
fi

if [ "$1" == "--cli" ] || [ "$1" == "cli" ]; then
    exec /usr/bin/python3 "$DIR/cli.py"
fi

if [ "$1" == "--dev" ] || [ "$1" == "dev" ]; then
    echo "Starting Pi Metrics API backend and Vite dev server..."
    /usr/bin/python3 "$DIR/server.py" &
    SERVER_PID=$!
    trap "kill $SERVER_PID 2>/dev/null" EXIT INT TERM
    sleep 1
    npm run dev
    exit 0
fi

if [ "$1" == "--terminal" ] || [ "$1" == "terminal" ]; then
    HOST=$(python3 -c "import json, os; cfg = json.load(open('$DIR/config.json')) if os.path.exists('$DIR/config.json') else {}; print(cfg.get('pi_host', '192.168.1.9'))")
    USER=$(python3 -c "import json, os; cfg = json.load(open('$DIR/config.json')) if os.path.exists('$DIR/config.json') else {}; print(cfg.get('pi_user', 'pi'))")
    PORT_NUM=$(python3 -c "import json, os; cfg = json.load(open('$DIR/config.json')) if os.path.exists('$DIR/config.json') else {}; print(cfg.get('pi_port', 22))")

    if command -v ptyxis >/dev/null 2>&1; then
        exec ptyxis --title "SSH - $USER@$HOST" -- ssh -p "$PORT_NUM" "$USER@$HOST"
    elif command -v gnome-terminal >/dev/null 2>&1; then
        exec gnome-terminal --title "SSH - $USER@$HOST" -- ssh -p "$PORT_NUM" "$USER@$HOST"
    elif command -v x-terminal-emulator >/dev/null 2>&1; then
        exec x-terminal-emulator -T "SSH - $USER@$HOST" -e ssh -p "$PORT_NUM" "$USER@$HOST"
    elif command -v xfce4-terminal >/dev/null 2>&1; then
        exec xfce4-terminal --title "SSH - $USER@$HOST" -e "ssh -p $PORT_NUM $USER@$HOST"
    else
        exec ssh -p "$PORT_NUM" "$USER@$HOST"
    fi
fi

# Web mode: start server and launch in default web browser
if [ "$1" == "--web" ] || [ "$1" == "web" ]; then
    if [ ! -d "$DIR/dist" ]; then
        echo "Building frontend..."
        (cd "$DIR" && npm run build)
    fi
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "Pi Metrics server is already running (PID: $(cat "$PID_FILE"))"
    else
        nohup /usr/bin/python3 "$DIR/server.py" > /tmp/pi-metrics.log 2>&1 &
        PID=$!
        echo "$PID" > "$PID_FILE"
        echo "🍓 Pi Metrics started (PID: $PID)."
    fi
    echo "Dashboard available at: http://localhost:$PORT"
    if command -v xdg-open >/dev/null 2>&1 && [ -n "$DISPLAY" ]; then
        sleep 1
        xdg-open "http://localhost:$PORT" >/dev/null 2>&1 &
    fi
    exit 0
fi

# Default or --app: Launch the standalone Linux Desktop App
exec /usr/bin/python3 "$DIR/app.py" "$@"
