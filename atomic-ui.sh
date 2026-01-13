#!/bin/bash

#############################################
# Atomic-UI Management Script
# X-UI Style Management for Atomic-UI
#
# Usage: atomic-ui [command]
# Commands: install, uninstall, update, start, stop, restart, status, logs, enable, disable
#############################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/atomic-ui"
SERVICE_NAME="atomic-ui"
DEFAULT_PORT=3000
GITHUB_REPO="sankahchan/atomic-ui"
SCRIPT_VERSION="1.0.0"

# Print banner
print_banner() {
    echo -e "${CYAN}"
    echo "================================================================"
    echo "                                                                "
    echo "     ███╗   ██╗████████╗ ██████╗ ███╗   ███╗██╗ ██████╗        "
    echo "     ████╗  ██║╚══██╔══╝██╔═══██╗████╗ ████║██║██╔════╝        "
    echo "     ██╔██╗ ██║   ██║   ██║   ██║██╔████╔██║██║██║             "
    echo "     ██║╚██╗██║   ██║   ██║   ██║██║╚██╔╝██║██║██║             "
    echo "     ██║ ╚████║   ██║   ╚██████╔╝██║ ╚═╝ ██║██║╚██████╗        "
    echo "     ╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝     ╚═╝╚═╝ ╚═════╝        "
    echo "                                                                "
    echo "              Atomic-UI Management Script v${SCRIPT_VERSION}    "
    echo "              Outline VPN Management Panel                      "
    echo "                                                                "
    echo "================================================================"
    echo -e "${NC}"
}

# Print step
print_step() {
    echo -e "${BLUE}[*]${NC} $1"
}

# Print success
print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

# Print warning
print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Print error
print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Print info
print_info() {
    echo -e "${PURPLE}[i]${NC} $1"
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

# Check for port conflicts
check_port_conflict() {
    print_step "Checking for port conflicts on ${DEFAULT_PORT}..."
    
    if lsof -i :${DEFAULT_PORT} > /dev/null 2>&1; then
        print_warning "Port ${DEFAULT_PORT} is already in use!"
        
        # Check if it's docker
        if lsof -i :${DEFAULT_PORT} | grep -q docker; then
            print_warning "Docker container is using port ${DEFAULT_PORT}"
            read -p "Do you want to stop Docker containers using this port? (y/n): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                # Find and stop containers using port 3000
                CONTAINER_IDS=$(docker ps --filter "publish=${DEFAULT_PORT}" -q 2>/dev/null)
                if [ -n "$CONTAINER_IDS" ]; then
                    docker stop $CONTAINER_IDS
                    print_success "Stopped Docker containers"
                fi
            else
                print_error "Cannot proceed with port conflict"
                exit 1
            fi
        else
            print_error "Another service is using port ${DEFAULT_PORT}. Please stop it first."
            lsof -i :${DEFAULT_PORT}
            exit 1
        fi
    else
        print_success "Port ${DEFAULT_PORT} is available"
    fi
}

# Install Node.js
install_nodejs() {
    print_step "Checking Node.js installation..."

    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            print_success "Node.js $(node -v) already installed"
            return
        fi
    fi

    print_step "Installing Node.js 20.x..."

    # Install Node.js via NodeSource
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs

    print_success "Node.js $(node -v) installed"
}

# Install system dependencies
install_dependencies() {
    print_step "Installing system dependencies..."

    apt-get update
    apt-get install -y git curl wget unzip openssl lsof

    print_success "Dependencies installed"
}

# Clone or update repository
setup_repository() {
    print_step "Setting up Atomic-UI..."

    if [ -d "$INSTALL_DIR" ]; then
        print_warning "Existing installation found at $INSTALL_DIR"
        read -p "Do you want to remove it and reinstall? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
            print_success "Old installation removed"
        else
            print_warning "Keeping existing installation"
            return
        fi
    fi

    git clone "https://github.com/${GITHUB_REPO}.git" "$INSTALL_DIR"
    print_success "Repository cloned to $INSTALL_DIR"

    cd "$INSTALL_DIR"
}

# Install npm dependencies (full clean install)
install_npm_deps() {
    print_step "Installing npm dependencies (clean install)..."

    cd "$INSTALL_DIR"
    
    # Remove old cache and modules for clean install
    rm -rf node_modules .next package-lock.json
    
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
    
    # Clean build
    rm -rf .next
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

# Install management script globally
install_management_script() {
    print_step "Installing management script..."
    
    # Copy this script to /usr/local/bin
    cp "$INSTALL_DIR/atomic-ui.sh" /usr/local/bin/atomic-ui
    chmod +x /usr/local/bin/atomic-ui
    
    print_success "Management script installed. Use 'atomic-ui' command to manage."
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
    echo -e "${GREEN}================================================================${NC}"
    echo -e "${GREEN}          INSTALLATION COMPLETE!                               ${NC}"
    echo -e "${GREEN}================================================================${NC}"
    echo ""
    echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"
    echo -e "${YELLOW}  Access your panel:${NC}"
    echo -e "  URL: ${GREEN}http://${SERVER_IP}:${DEFAULT_PORT}${NC}"
    echo ""
    echo -e "${YELLOW}  Default login credentials:${NC}"
    echo -e "  Username: ${GREEN}admin${NC}"
    echo -e "  Password: ${GREEN}admin123${NC}"
    echo ""
    echo -e "${RED}  ⚠ IMPORTANT: Change the password after first login!${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${YELLOW}  Management commands:${NC}"
    echo -e "  ${BLUE}atomic-ui${NC}          - Show management menu"
    echo -e "  ${BLUE}atomic-ui status${NC}   - Check service status"
    echo -e "  ${BLUE}atomic-ui logs${NC}     - View logs"
    echo -e "  ${BLUE}atomic-ui restart${NC}  - Restart service"
    echo -e "  ${BLUE}atomic-ui update${NC}   - Update to latest version"
    echo ""
    echo -e "${YELLOW}  Configuration file:${NC}"
    echo -e "  ${BLUE}${INSTALL_DIR}/.env${NC}"
    echo ""
}

# ============================================
# Management Functions
# ============================================

# Start service
start_service() {
    print_step "Starting Atomic-UI..."
    systemctl start ${SERVICE_NAME}
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        print_success "Atomic-UI started successfully"
    else
        print_error "Failed to start Atomic-UI"
        systemctl status ${SERVICE_NAME}
    fi
}

# Stop service
stop_service() {
    print_step "Stopping Atomic-UI..."
    systemctl stop ${SERVICE_NAME}
    print_success "Atomic-UI stopped"
}

# Restart service
restart_service() {
    print_step "Restarting Atomic-UI..."
    systemctl restart ${SERVICE_NAME}
    sleep 2
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        print_success "Atomic-UI restarted successfully"
    else
        print_error "Failed to restart Atomic-UI"
        systemctl status ${SERVICE_NAME}
    fi
}

# Show status
show_status() {
    echo ""
    echo -e "${CYAN}Atomic-UI Service Status${NC}"
    echo -e "${CYAN}────────────────────────${NC}"
    
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        echo -e "Status: ${GREEN}Running${NC}"
    else
        echo -e "Status: ${RED}Stopped${NC}"
    fi
    
    if systemctl is-enabled --quiet ${SERVICE_NAME} 2>/dev/null; then
        echo -e "Auto-start: ${GREEN}Enabled${NC}"
    else
        echo -e "Auto-start: ${YELLOW}Disabled${NC}"
    fi
    
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "Install Dir: ${BLUE}${INSTALL_DIR}${NC}"
        if [ -f "$INSTALL_DIR/package.json" ]; then
            VERSION=$(grep '"version"' "$INSTALL_DIR/package.json" | cut -d'"' -f4)
            echo -e "Version: ${BLUE}${VERSION}${NC}"
        fi
    else
        echo -e "Install Dir: ${RED}Not Found${NC}"
    fi
    
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "Unknown")
    echo -e "Panel URL: ${BLUE}http://${SERVER_IP}:${DEFAULT_PORT}${NC}"
    echo ""
}

# Show logs
show_logs() {
    echo -e "${CYAN}Showing Atomic-UI logs (Ctrl+C to exit)${NC}"
    echo ""
    journalctl -u ${SERVICE_NAME} -f
}

# Enable auto-start
enable_service() {
    print_step "Enabling auto-start..."
    systemctl enable ${SERVICE_NAME}
    print_success "Atomic-UI will start automatically on boot"
}

# Disable auto-start
disable_service() {
    print_step "Disabling auto-start..."
    systemctl disable ${SERVICE_NAME}
    print_success "Atomic-UI will not start automatically on boot"
}

# Update to latest version
update_service() {
    print_step "Updating Atomic-UI to latest version..."
    
    if [ ! -d "$INSTALL_DIR" ]; then
        print_error "Atomic-UI is not installed"
        exit 1
    fi
    
    cd "$INSTALL_DIR"
    
    # Stop service
    systemctl stop ${SERVICE_NAME}
    
    # Backup .env and database
    print_step "Backing up configuration..."
    cp .env .env.backup 2>/dev/null || true
    cp -r prisma/data prisma/data.backup 2>/dev/null || true
    
    # Pull latest code
    print_step "Downloading latest version..."
    git fetch origin
    git reset --hard origin/main
    
    # Restore .env
    cp .env.backup .env 2>/dev/null || true
    
    # Clean install
    print_step "Installing dependencies..."
    rm -rf node_modules .next package-lock.json
    npm install --production=false
    
    # Regenerate Prisma and migrate
    print_step "Updating database..."
    npx prisma generate
    npx prisma db push
    
    # Rebuild
    print_step "Building application..."
    npm run build
    
    # Restart service
    systemctl start ${SERVICE_NAME}
    
    print_success "Atomic-UI updated successfully!"
    show_status
}

# Uninstall
uninstall_service() {
    echo ""
    echo -e "${RED}⚠ WARNING: This will completely remove Atomic-UI${NC}"
    echo ""
    read -p "Are you sure you want to uninstall? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Uninstall cancelled"
        return
    fi
    
    read -p "Do you want to keep the database? (y/n): " -n 1 -r
    echo
    KEEP_DB=$REPLY
    
    print_step "Stopping service..."
    systemctl stop ${SERVICE_NAME} 2>/dev/null || true
    
    print_step "Disabling service..."
    systemctl disable ${SERVICE_NAME} 2>/dev/null || true
    
    print_step "Removing service file..."
    rm -f /etc/systemd/system/${SERVICE_NAME}.service
    systemctl daemon-reload
    
    if [[ $KEEP_DB =~ ^[Yy]$ ]]; then
        print_step "Backing up database..."
        mkdir -p /root/atomic-ui-backup
        cp -r "$INSTALL_DIR/prisma/data" /root/atomic-ui-backup/ 2>/dev/null || true
        cp "$INSTALL_DIR/.env" /root/atomic-ui-backup/ 2>/dev/null || true
        print_info "Database backed up to /root/atomic-ui-backup/"
    fi
    
    print_step "Removing installation directory..."
    rm -rf "$INSTALL_DIR"
    
    print_step "Removing management script..."
    rm -f /usr/local/bin/atomic-ui
    
    print_success "Atomic-UI has been uninstalled"
    
    if [[ $KEEP_DB =~ ^[Yy]$ ]]; then
        echo ""
        print_info "Your data is saved at /root/atomic-ui-backup/"
        print_info "To restore after reinstall, copy the files back to $INSTALL_DIR"
    fi
}

# Show menu
show_menu() {
    print_banner
    show_status
    
    echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"
    echo -e "${YELLOW}  Management Menu${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "  ${GREEN}1)${NC} Start Atomic-UI"
    echo -e "  ${GREEN}2)${NC} Stop Atomic-UI"
    echo -e "  ${GREEN}3)${NC} Restart Atomic-UI"
    echo ""
    echo -e "  ${GREEN}4)${NC} View Logs"
    echo -e "  ${GREEN}5)${NC} Check Status"
    echo ""
    echo -e "  ${GREEN}6)${NC} Enable Auto-start"
    echo -e "  ${GREEN}7)${NC} Disable Auto-start"
    echo ""
    echo -e "  ${GREEN}8)${NC} Update Atomic-UI"
    echo -e "  ${GREEN}9)${NC} Reinstall Atomic-UI"
    echo ""
    echo -e "  ${RED}10)${NC} Uninstall Atomic-UI"
    echo ""
    echo -e "  ${GREEN}0)${NC} Exit"
    echo ""
    
    read -p "Please enter your choice [0-10]: " choice
    
    case $choice in
        1) start_service ;;
        2) stop_service ;;
        3) restart_service ;;
        4) show_logs ;;
        5) show_status ;;
        6) enable_service ;;
        7) disable_service ;;
        8) update_service ;;
        9) install_full ;;
        10) uninstall_service ;;
        0) exit 0 ;;
        *) print_error "Invalid option" ;;
    esac
}

# Full installation
install_full() {
    print_banner
    
    check_root
    check_system
    check_port_conflict
    install_dependencies
    install_nodejs
    setup_repository
    install_npm_deps
    setup_environment
    setup_database
    build_app
    create_service
    install_management_script
    setup_firewall

    print_completion
}

# ============================================
# Main Entry Point
# ============================================

main() {
    case "$1" in
        install)
            check_root
            install_full
            ;;
        uninstall)
            check_root
            uninstall_service
            ;;
        update)
            check_root
            update_service
            ;;
        start)
            check_root
            start_service
            ;;
        stop)
            check_root
            stop_service
            ;;
        restart)
            check_root
            restart_service
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        enable)
            check_root
            enable_service
            ;;
        disable)
            check_root
            disable_service
            ;;
        "")
            # No argument - show menu
            check_root
            show_menu
            ;;
        *)
            echo "Usage: atomic-ui [command]"
            echo ""
            echo "Commands:"
            echo "  install    - Install Atomic-UI"
            echo "  uninstall  - Uninstall Atomic-UI"
            echo "  update     - Update to latest version"
            echo "  start      - Start service"
            echo "  stop       - Stop service"
            echo "  restart    - Restart service"
            echo "  status     - Show status"
            echo "  logs       - View logs"
            echo "  enable     - Enable auto-start"
            echo "  disable    - Disable auto-start"
            echo ""
            echo "Run without arguments to show interactive menu."
            ;;
    esac
}

# Run main function
main "$@"
