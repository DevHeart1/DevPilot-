#!/bin/bash
# Enable verbose tracing for Cloud Run logs
set -x

export PORT="${PORT:-8080}"
export DISPLAY="${DISPLAY:-:1}"
export WS_PORT="${WS_PORT:-6080}"
export HOME=/root

echo "--- DevPilot Sandbox Startup Diagnostics ---"
echo "Current User: $(whoami)"
echo "Environment: PORT=$PORT, DISPLAY=$DISPLAY, WS_PORT=$WS_PORT"

# 1. Setup VNC Config (User is already created in Dockerfile)
mkdir -p ~/.vnc
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

# 2. Start KasmVNC
echo "Starting KasmVNC..."
# We use nohup and redirect logs to stdout/stderr
# -disableHttpAuth allows the Express proxy to reach it without any prompt
# -no-prohibit-root is sometimes needed in Docker
nohup kasmvncserver $DISPLAY -depth 24 -geometry 1440x950 -disableHttpAuth > /tmp/kasmvnc.log 2>&1 &

# 3. Give it a moment and check logs
sleep 5
echo "--- KasmVNC Startup Logs ---"
[ -f /tmp/kasmvnc.log ] && cat /tmp/kasmvnc.log

# 4. Start Node.js API server
echo "Starting Node.js server on port $PORT..."
tail -f /tmp/kasmvnc.log &

# Final process
node dist/index.js
