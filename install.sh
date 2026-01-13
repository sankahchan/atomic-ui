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

# Check for port conflicts
echo -e "${BLUE}[*]${NC} Checking for port conflicts..."
if command -v lsof &> /dev/null && lsof -i :3000 > /dev/null 2>&1; then
    echo -e "${YELLOW}[!]${NC} Port 3000 is in use. Attempting to resolve..."
    
    # Check if it's a docker container
    if lsof -i :3000 | grep -q docker; then
        echo -e "${YELLOW}[!]${NC} Docker container detected on port 3000"
        CONTAINER_IDS=$(docker ps --filter "publish=3000" -q 2>/dev/null)
        if [ -n "$CONTAINER_IDS" ]; then
            echo -e "${BLUE}[*]${NC} Stopping Docker containers..."
            docker stop $CONTAINER_IDS
            echo -e "${GREEN}[✓]${NC} Docker containers stopped"
        fi
    fi
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

# Setup environment
if [ ! -f .env ]; then
    cp .env.example .env
    JWT_SECRET=$(openssl rand -base64 32)
    sed -i "s|your-super-secret-jwt-key-change-this-in-production|${JWT_SECRET}|g" .env
    SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "localhost")
    sed -i "s|http://localhost:3000|http://${SERVER_IP}:3000|g" .env
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

# Create service
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
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable atomic-ui > /dev/null 2>&1
systemctl start atomic-ui
echo -e "${GREEN}[✓]${NC} Service started"

# Install management script
chmod +x "$INSTALL_DIR/atomic-ui.sh"
cp "$INSTALL_DIR/atomic-ui.sh" /usr/local/bin/atomic-ui
echo -e "${GREEN}[✓]${NC} Management script installed"

# Firewall
if command -v ufw &> /dev/null; then
    ufw allow 3000/tcp > /dev/null 2>&1
    echo -e "${GREEN}[✓]${NC} Firewall configured"
fi

# Done!
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "YOUR_SERVER_IP")

echo ""
echo -e "${GREEN}=============================================================${NC}"
echo -e "${GREEN}          INSTALLATION COMPLETE!                             ${NC}"
echo -e "${GREEN}=============================================================${NC}"
echo ""
echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
echo -e "${YELLOW}  Access your panel:${NC}"
echo -e "  URL: ${GREEN}http://${SERVER_IP}:3000${NC}"
echo ""
echo -e "${YELLOW}  Default login credentials:${NC}"
echo -e "  Username: ${GREEN}admin${NC}"
echo -e "  Password: ${GREEN}admin123${NC}"
echo ""
echo -e "${RED}  ⚠ IMPORTANT: Change the password after first login!${NC}"
echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
echo ""
echo -e "${YELLOW}  Management:${NC}"
echo -e "  Run ${BLUE}atomic-ui${NC} to access the management menu"
echo ""
