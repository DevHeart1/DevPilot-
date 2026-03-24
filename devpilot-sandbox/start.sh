#!/bin/bash
# Enable verbose tracing for Cloud Run logs
set -x

export PORT="${PORT:-8080}"
export DISPLAY="${DISPLAY:-:1}"
export WS_PORT="${WS_PORT:-6080}"
export HOME=/root
export PATH="$PATH:/usr/share/kasmvnc/bin"

echo "--- DevPilot Sandbox Startup Diagnostics ---"
echo "Current User: $(whoami)"
echo "Environment: PORT=$PORT, DISPLAY=$DISPLAY, WS_PORT=$WS_PORT"

# 1. Setup VNC Config
mkdir -p ~/.vnc

# Try to create user non-interactively
# Different versions of KasmVNC store kasmvncuser in different places
if command -v kasmvncuser >/dev/null 2>&1; then
    kasmvncuser -u devpilot -p devpilot -w || echo "User creation failed but continuing..."
elif [ -f "/usr/share/kasmvnc/bin/kasmvncuser" ]; then
    /usr/share/kasmvnc/bin/kasmvncuser -u devpilot -p devpilot -w
else
    echo "kasmvncuser not found. Attempting to bypass wizard via pipe..."
    # If the server starts and asks for user (selection 1), give it username and password
    # This is a bit of a hack for the perl-based wizard
    printf "1\ndevpilot\ndevpilot\n" | kasmvncserver $DISPLAY -depth 24 -geometry 1440x950 -disableHttpAuth &
    SERVER_PID=$!
    sleep 5
fi

# If server not started via pipe hack, start it normally
if [ -z "$SERVER_PID" ] || ! ps -p $SERVER_PID > /dev/null; then
    echo "Starting KasmVNC normally..."
    nohup kasmvncserver $DISPLAY -depth 24 -geometry 1440x950 -disableHttpAuth > /tmp/kasmvnc.log 2>&1 &
fi

# Generate kasmvnc.yaml for other settings
cat << EOF > ~/.vnc/kasmvnc.yaml
network:
  protocol: ipv4
  interface: 0.0.0.0
  websocket_port: ${WS_PORT}
  use_ipv4: true
  use_ipv6: false
  ssl:
    require_ssl: false
EOF

# Setup xstartup
cat << 'EOF' > ~/.vnc/xstartup
#!/bin/sh
fluxbox &
EOF
chmod +x ~/.vnc/xstartup

# 2. Wait and check
sleep 5
echo "--- KasmVNC Startup Logs ---"
[ -f /tmp/kasmvnc.log ] && cat /tmp/kasmvnc.log

# 3. Start Node.js API server
echo "Starting Node.js server on port $PORT..."
tail -f /tmp/kasmvnc.log &

# Final process
node dist/index.js
