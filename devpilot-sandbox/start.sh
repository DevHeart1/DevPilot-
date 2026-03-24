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

# 1. Verify environment
if ! command -v kasmvncserver >/dev/null 2>&1; then
    echo "ERROR: kasmvncserver not found!"
    exit 1
fi

# 2. Setup VNC directories and User
mkdir -p ~/.vnc
# Create a KasmVNC user non-interactively to bypass the startup prompt
# -u user, -p password, -w (write access)
kasmvncuser -u devpilot -p devpilot -w || echo "User might already exist"

# Generate kasmvnc.yaml 
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

# 3. Start KasmVNC
echo "Starting KasmVNC..."
# We use nohup and redirect logs to stdout/stderr
# -disableHttpAuth allows the Express proxy to reach it without the user/pass prompt in the browser
nohup kasmvncserver $DISPLAY -depth 24 -geometry 1440x950 -disableHttpAuth > /tmp/kasmvnc.log 2>&1 &

# 4. Give it a moment and check logs
sleep 5
if [ -f /tmp/kasmvnc.log ]; then
    echo "--- KasmVNC Initial Logs ---"
    cat /tmp/kasmvnc.log
fi

# 5. Start Node.js API server
echo "Starting Node.js server on port $PORT..."
# Tailing logs in background so they appear in Cloud Run stream
tail -f /tmp/kasmvnc.log &

# Final process
node dist/index.js
