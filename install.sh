#!/bin/bash

#############################################
# Atomic-UI Installation Script
# One-command installation for Ubuntu/Debian VPS
#
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
#############################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/atomic-ui"
SERVICE_NAME="atomic-ui"
DEFAULT_PORT=3000
GITHUB_REPO="sankahchan/atomic-ui"

# Print banner
print_banner() {
    echo -e "${CYAN}"
    echo "============================================================="
    echo "                                                             "
    echo "              ATOMIC-UI INSTALLER                            "
    echo "         Outline VPN Management Panel                        "
    echo "                                                             "
    echo "============================================================="
    echo -e "${NC}"
}

# Print step
print_step() {
    echo -e "${BLUE}[*]${NC} $1"
}

# Print success
print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

# Print warning
print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Print error
print_error() {
    echo -e "${RED}[X]${NC} $1"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Please run as root (use sudo)"
        exit 1
    fi
}

# Check system requirements
check_system() {
    print_step "Checking system requirements..."

    # Check OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        print_error "Cannot detect operating system"
        exit 1
    fi

    if [[ "$OS" != "ubuntu" && "$OS" != "debian" ]]; then
        print_warning "This script is designed for Ubuntu/Debian. Other systems may work but are not officially supported."
    fi

    # Check architecture
    ARCH=$(uname -m)
    if [[ "$ARCH" != "x86_64" && "$ARCH" != "aarch64" ]]; then
        print_error "Unsupported architecture: $ARCH"
        exit 1
    fi

    print_success "System check passed: $OS $VERSION ($ARCH)"
}

# Install Node.js
install_nodejs() {
    print_step "Installing Node.js 20.x..."

    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            print_success "Node.js $(node -v) already installed"
            return
        fi
    fi

    # Install Node.js via NodeSource
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs

    print_success "Node.js $(node -v) installed"
}

# Install system dependencies
install_dependencies() {
    print_step "Installing system dependencies..."

    apt-get update
    apt-get install -y git curl wget unzip openssl

    print_success "Dependencies installed"
}

# Clone or update repository
setup_repository() {
    print_step "Setting up Atomic-UI..."

    if [ -d "$INSTALL_DIR" ]; then
        print_warning "Existing installation found at $INSTALL_DIR"
        read -p "Do you want to update it? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cd "$INSTALL_DIR"
            git fetch origin
            git reset --hard origin/main
            print_success "Repository updated"
        else
            print_warning "Skipping repository update"
        fi
    else
        git clone "https://github.com/${GITHUB_REPO}.git" "$INSTALL_DIR"
        print_success "Repository cloned to $INSTALL_DIR"
    fi

    cd "$INSTALL_DIR"
}

# Install npm dependencies
install_npm_deps() {
    print_step "Installing npm dependencies..."

    cd "$INSTALL_DIR"
    npm install --production=false

    print_success "npm dependencies installed"
}

# Setup environment
setup_environment() {
    print_step "Setting up environment..."

    cd "$INSTALL_DIR"

    if [ ! -f .env ]; then
        cp .env.example .env

        # Generate secure JWT secret
        JWT_SECRET=$(openssl rand -base64 32)
        sed -i "s|your-super-secret-jwt-key-change-this-in-production|${JWT_SECRET}|g" .env

        # Get server IP for APP_URL
        SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "localhost")
        sed -i "s|http://localhost:3000|http://${SERVER_IP}:${DEFAULT_PORT}|g" .env

        print_success "Environment configured"
        print_warning "Edit $INSTALL_DIR/.env to customize settings"
    else
        print_warning ".env file already exists, skipping"
    fi
}

# Setup database
setup_database() {
    print_step "Setting up database..."

    cd "$INSTALL_DIR"

    # Create data directory
    mkdir -p prisma/data

    # Generate Prisma client and push schema
    npx prisma generate
    npx prisma db push

    # Run setup script to create admin user
    npm run setup

    print_success "Database setup complete"
}

# Build application
build_app() {
    print_step "Building application..."

    cd "$INSTALL_DIR"
    npm run build

    print_success "Application built successfully"
}

# Create systemd service
create_service() {
    print_step "Creating systemd service..."

    cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
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
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=${SERVICE_NAME}
Environment=NODE_ENV=production
Environment=PORT=${DEFAULT_PORT}

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME}
    systemctl start ${SERVICE_NAME}

    print_success "Service created and started"
}

# Setup firewall
setup_firewall() {
    print_step "Configuring firewall..."

    if command -v ufw &> /dev/null; then
        ufw allow ${DEFAULT_PORT}/tcp
        print_success "Firewall rule added for port ${DEFAULT_PORT}"
    else
        print_warning "UFW not found, skipping firewall configuration"
    fi
}

# Print completion message
print_completion() {
    SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "YOUR_SERVER_IP")

    echo ""
    echo -e "${GREEN}=============================================================${NC}"
    echo -e "${GREEN}          INSTALLATION COMPLETE!                             ${NC}"
    echo -e "${GREEN}=============================================================${NC}"
    echo ""
    echo -e "${CYAN}-------------------------------------------------------------${NC}"
    echo -e "${YELLOW}  Access your panel:${NC}"
    echo -e "  URL: ${GREEN}http://${SERVER_IP}:${DEFAULT_PORT}${NC}"
    echo ""
    echo -e "${YELLOW}  Default login credentials:${NC}"
    echo -e "  Username: ${GREEN}admin${NC}"
    echo -e "  Password: ${GREEN}admin123${NC}"
    echo ""
    echo -e "${RED}  IMPORTANT: Change the password after first login!${NC}"
    echo -e "${CYAN}-------------------------------------------------------------${NC}"
    echo ""
    echo -e "${YELLOW}  Useful commands:${NC}"
    echo -e "  Check status: ${BLUE}systemctl status ${SERVICE_NAME}${NC}"
    echo -e "  View logs:    ${BLUE}journalctl -u ${SERVICE_NAME} -f${NC}"
    echo -e "  Restart:      ${BLUE}systemctl restart ${SERVICE_NAME}${NC}"
    echo -e "  Stop:         ${BLUE}systemctl stop ${SERVICE_NAME}${NC}"
    echo ""
    echo -e "${YELLOW}  Configuration file:${NC}"
    echo -e "  ${BLUE}${INSTALL_DIR}/.env${NC}"
    echo ""
}

# Main installation function
main() {
    print_banner

    check_root
    check_system
    install_dependencies
    install_nodejs
    setup_repository
    install_npm_deps
    setup_environment
    setup_database
    build_app
    create_service
    setup_firewall

    print_completion
}

# Run main function
main "$@"
