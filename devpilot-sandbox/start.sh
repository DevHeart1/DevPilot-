#!/bin/bash
set -e

# Default port configuration
export PORT="${PORT:-8080}"
export DISPLAY="${DISPLAY:-:1}"
export WS_PORT="${WS_PORT:-6080}"
export KASM_VNC_PATH=/usr/share/kasmvnc

echo "Starting DevPilot Sandbox Service..."

# 1. Setup KasmVNC environment and password
mkdir -p ~/.vnc
echo -e "devpilot\ndevpilot\nn\n" | vncpasswd -f > ~/.vnc/passwd
chmod 600 ~/.vnc/passwd

# Optional custom KasmVNC config to skip ssl
cat << 'EOF' > ~/.vnc/kasmvnc.yaml
network:
  protocol: ipv4
  interface: 0.0.0.0
  websocket_port: ${WS_PORT}
  use_ipv4: true
  use_ipv6: false
  udp:
    port: ${WS_PORT}
  ssl:
    require_ssl: false
EOF

# Replace variables in the config
sed -i "s/\${WS_PORT}/$WS_PORT/g" ~/.vnc/kasmvnc.yaml

# 2. Start Window Manager (Helpful for rendering some elements)
# Note: KasmVNC doesn't automatically start a WM if we don't have xstartup
# But it does start a session, Fluxbox can attach to it. Let's just start KasmVNC,
# it will execute ~/.vnc/xstartup. Let's create it.
cat << 'EOF' > ~/.vnc/xstartup
#!/bin/sh
xrdb $HOME/.Xresources 2>/dev/null
xsetroot -solid grey
fluxbox &
EOF
chmod +x ~/.vnc/xstartup

# 3. Start KasmVNC (Provides X server, VNC, WebSocket, and Web Client)
echo "Starting KasmVNC on port $WS_PORT and DISPLAY $DISPLAY..."
kasmvncserver $DISPLAY -depth 24 -geometry 1440x950 -disableHttpAuth
sleep 2

# 5. Start Node.js API server
echo "Starting Node.js server on port $PORT..."
# The Node server will proxy requests to $WS_PORT for /novnc and websockets
node dist/index.js
