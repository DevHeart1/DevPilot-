# Use the official Microsoft Playwright image as a base
# It already comes with Node.js and all browser dependencies
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Set environment variables for non-interactive installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for the GUI stack
RUN apt-get update && apt-get install -y \
    fluxbox \
    wget \
    libxfont2 \
    libxkbfile1 \
    libjpeg-turbo8 \
    x11-xserver-utils \
    libnss3-tools \
    && wget https://github.com/kasmtech/KasmVNC/releases/download/v1.3.3/kasmvncserver_focal_1.3.3_amd64.deb \
    && apt-get install -y ./kasmvncserver_focal_1.3.3_amd64.deb \
    && rm -f kasmvncserver_focal_1.3.3_amd64.deb \
    && rm -rf /var/lib/apt/lists/*

# Pre-create KasmVNC directory
RUN mkdir -p /root/.vnc

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy project source
COPY . .

# Build the TypeScript source
RUN npm run build

# Ensure the start script is executable
RUN chmod +x start.sh

# Cloud Run expects the service to listen on $PORT
# noVNC and websockify will use internal ports linked to this
ENV PORT=8080
ENV WS_PORT=6080

# Expose the ports (informative for local use)
EXPOSE 8080
EXPOSE 6080

# Start the sandbox using the helper script
CMD ["./start.sh"]
