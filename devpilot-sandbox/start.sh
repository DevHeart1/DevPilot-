#!/bin/bash
set -e

# Default port configuration
export PORT="${PORT:-8080}"
export DISPLAY="${DISPLAY:-:99}"
export VNC_PORT="${VNC_PORT:-5900}"
export WS_PORT="${WS_PORT:-6080}"

echo "Starting DevPilot Sandbox Service..."

# 1. Start Xvfb
# Screen 0 is set to 1280x800 with 24-bit color depth
echo "Starting Xvfb on DISPLAY=$DISPLAY..."
Xvfb $DISPLAY -screen 0 1280x800x24 &
sleep 2

# 2. Start Window Manager (Optional but helpful for rendering some elements)
echo "Starting Fluxbox..."
fluxbox -display $DISPLAY &

# 3. Start x11vnc
echo "Starting x11vnc on port $VNC_PORT..."
x11vnc -display $DISPLAY -bg -nopw -listen localhost -xkb -ncache 10 -ncache_cr -forever -rfbport $VNC_PORT

# 4. Start websockify
# Bridges WebSocket traffic to the local VNC TCP port
# We use --web /usr/share/novnc to serve the standard noVNC UI statically if requested directly from WS_PORT
echo "Starting websockify on port $WS_PORT..."
websockify --web /usr/share/novnc $WS_PORT localhost:$VNC_PORT &
sleep 2

# 5. Start Node.js API server
echo "Starting Node.js server on port $PORT..."
# The Node server will proxy requests to $WS_PORT for /novnc and websockets
node dist/index.js
