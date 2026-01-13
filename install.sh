#!/bin/bash

#############################################
# Atomic-UI Quick Installation Script
# One-command installation for Ubuntu/Debian VPS
#
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
#
# Or download and run:
#   curl -fsSL https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh -o install.sh
#   sudo bash install.sh
#############################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Config
INSTALL_DIR="/opt/atomic-ui"
GITHUB_REPO="sankahchan/atomic-ui"

# Generate random port between 10000-65000
generate_random_port() {
    while true; do
        PORT=$((RANDOM % 55000 + 10000))
        # Check if port is available
        if ! lsof -i :$PORT > /dev/null 2>&1; then
            echo $PORT
            return
        fi
    done
}

# Generate random path for security (like 3x-ui)
generate_random_path() {
    # Generate a random 8-character alphanumeric string
    openssl rand -hex 4
}

echo -e "${CYAN}"
echo "============================================================="
echo "                                                             "
echo "              ATOMIC-UI INSTALLER                            "
echo "         Outline VPN Management Panel                        "
echo "                                                             "
echo "============================================================="
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[✗] Please run as root (use sudo)${NC}"
    exit 1
fi

# Check system
echo -e "${BLUE}[*]${NC} Checking system requirements..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo -e "${GREEN}[✓]${NC} Detected: $PRETTY_NAME"
else
    echo -e "${YELLOW}[!]${NC} Could not detect OS"
fi

# Generate random port
echo -e "${BLUE}[*]${NC} Generating secure random port..."
PANEL_PORT=$(generate_random_port)
echo -e "${GREEN}[✓]${NC} Panel port: ${CYAN}${PANEL_PORT}${NC}"

# Generate random path for security
echo -e "${BLUE}[*]${NC} Generating secure random path..."
PANEL_PATH=$(generate_random_path)
echo -e "${GREEN}[✓]${NC} Panel path: ${CYAN}/${PANEL_PATH}/${NC}"

# Check for port conflicts
echo -e "${BLUE}[*]${NC} Checking for port conflicts..."
if command -v lsof &> /dev/null && lsof -i :${PANEL_PORT} > /dev/null 2>&1; then
    echo -e "${YELLOW}[!]${NC} Port ${PANEL_PORT} is in use, generating another..."
    PANEL_PORT=$(generate_random_port)
    echo -e "${GREEN}[✓]${NC} New panel port: ${CYAN}${PANEL_PORT}${NC}"
fi

# Install dependencies
echo -e "${BLUE}[*]${NC} Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq git curl wget unzip openssl lsof > /dev/null

# Install Node.js if needed
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 18 ]; then
    echo -e "${BLUE}[*]${NC} Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null
fi
echo -e "${GREEN}[✓]${NC} Node.js $(node -v) ready"

# Clone repository
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}[!]${NC} Removing existing installation..."
    rm -rf "$INSTALL_DIR"
fi

echo -e "${BLUE}[*]${NC} Downloading Atomic-UI..."
git clone --depth 1 "https://github.com/${GITHUB_REPO}.git" "$INSTALL_DIR" > /dev/null 2>&1
echo -e "${GREEN}[✓]${NC} Downloaded to $INSTALL_DIR"

cd "$INSTALL_DIR"

# Clean install npm dependencies
echo -e "${BLUE}[*]${NC} Installing npm dependencies..."
rm -rf node_modules .next package-lock.json 2>/dev/null || true
npm install --production=false --silent > /dev/null 2>&1
echo -e "${GREEN}[✓]${NC} Dependencies installed"

# Setup environment with random port
echo -e "${BLUE}[*]${NC} Configuring environment..."
cp .env.example .env

# Generate secure JWT secret
JWT_SECRET=$(openssl rand -base64 32)
sed -i "s|your-super-secret-jwt-key-change-this-in-production|${JWT_SECRET}|g" .env

# Get server IP
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "localhost")

# Set the random port in .env
sed -i "s|http://localhost:3000|http://${SERVER_IP}:${PANEL_PORT}|g" .env

# Add PORT to .env if not exists
if ! grep -q "^PORT=" .env; then
    echo "PORT=${PANEL_PORT}" >> .env
else
    sed -i "s|^PORT=.*|PORT=${PANEL_PORT}|g" .env
fi

# Add PANEL_PATH to .env for the random URL path
if ! grep -q "^PANEL_PATH=" .env; then
    echo "PANEL_PATH=/${PANEL_PATH}" >> .env
else
    sed -i "s|^PANEL_PATH=.*|PANEL_PATH=/${PANEL_PATH}|g" .env
fi

echo -e "${GREEN}[✓]${NC} Environment configured"

# Setup database
echo -e "${BLUE}[*]${NC} Setting up database..."
mkdir -p prisma/data
npx prisma generate > /dev/null 2>&1
npx prisma db push > /dev/null 2>&1
npm run setup > /dev/null 2>&1
echo -e "${GREEN}[✓]${NC} Database ready"

# Build
echo -e "${BLUE}[*]${NC} Building application..."
npm run build > /dev/null 2>&1
echo -e "${GREEN}[✓]${NC} Build complete"

# Create service with random port
echo -e "${BLUE}[*]${NC} Creating systemd service..."
cat > /etc/systemd/system/atomic-ui.service << EOF
[Unit]
Description=Atomic-UI - Outline VPN Management Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=${PANEL_PORT}
Environment=PANEL_PATH=/${PANEL_PATH}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable atomic-ui > /dev/null 2>&1
systemctl start atomic-ui
echo -e "${GREEN}[✓]${NC} Service started on port ${PANEL_PORT}"

# Install management script
chmod +x "$INSTALL_DIR/atomic-ui.sh"
cp "$INSTALL_DIR/atomic-ui.sh" /usr/local/bin/atomic-ui
echo -e "${GREEN}[✓]${NC} Management script installed"

# Firewall - add the random port
if command -v ufw &> /dev/null; then
    ufw allow ${PANEL_PORT}/tcp > /dev/null 2>&1
    echo -e "${GREEN}[✓]${NC} Firewall configured for port ${PANEL_PORT}"
fi

# Save port and path to config files for the management script
echo "${PANEL_PORT}" > "$INSTALL_DIR/.panel_port"
echo "/${PANEL_PATH}" > "$INSTALL_DIR/.panel_path"

# Done!
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              INSTALLATION COMPLETE!                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}┌──────────────────────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}│${NC}  ${YELLOW}Access your panel:${NC}"
echo -e "${CYAN}│${NC}  URL: ${GREEN}http://${SERVER_IP}:${PANEL_PORT}/${PANEL_PATH}/${NC}"
echo -e "${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${YELLOW}Your panel port:${NC} ${GREEN}${PANEL_PORT}${NC}"
echo -e "${CYAN}│${NC}  ${YELLOW}Your panel path:${NC} ${GREEN}/${PANEL_PATH}/${NC}"
echo -e "${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${YELLOW}Default login credentials:${NC}"
echo -e "${CYAN}│${NC}  Username: ${GREEN}admin${NC}"
echo -e "${CYAN}│${NC}  Password: ${GREEN}admin123${NC}"
echo -e "${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${RED}⚠ IMPORTANT: Change the password after first login!${NC}"
echo -e "${CYAN}│${NC}  ${RED}⚠ SAVE YOUR PANEL PATH - You need it to access the panel!${NC}"
echo -e "${CYAN}└──────────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "${YELLOW}  Management:${NC}"
echo -e "  Run ${BLUE}atomic-ui${NC} to access the management menu"
echo -e "  Run ${BLUE}atomic-ui info${NC} to view panel URL and path"
echo ""
