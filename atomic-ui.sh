#!/bin/bash

#############################################
# Atomic-UI Management Script
# X-UI Style Management for Atomic-UI
#
# Usage: atomic-ui [command]
# Commands: install, uninstall, update, start, stop, restart, status, logs, port, enable, disable
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
GITHUB_REPO="sankahchan/atomic-ui"
SCRIPT_VERSION="1.2.0"

# Get current port from saved file or default
get_current_port() {
    if [ -f "$INSTALL_DIR/.panel_port" ]; then
        cat "$INSTALL_DIR/.panel_port"
    else
        # Try to get from systemd service
        if [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
            grep "Environment=PORT=" /etc/systemd/system/${SERVICE_NAME}.service 2>/dev/null | cut -d'=' -f3 || echo "3000"
        else
            echo "3000"
        fi
    fi
}

# Get current path from saved file or default
get_current_path() {
    if [ -f "$INSTALL_DIR/.panel_path" ]; then
        cat "$INSTALL_DIR/.panel_path"
    else
        # Try to get from systemd service
        if [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
            grep "Environment=PANEL_PATH=" /etc/systemd/system/${SERVICE_NAME}.service 2>/dev/null | cut -d'=' -f3 || echo ""
        else
            echo ""
        fi
    fi
}

CURRENT_PORT=$(get_current_port)
CURRENT_PATH=$(get_current_path)

# Print banner
print_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║     ███╗   ██╗████████╗ ██████╗ ███╗   ███╗██╗ ██████╗       ║"
    echo "║     ████╗  ██║╚══██╔══╝██╔═══██╗████╗ ████║██║██╔════╝       ║"
    echo "║     ██╔██╗ ██║   ██║   ██║   ██║██╔████╔██║██║██║            ║"
    echo "║     ██║╚██╗██║   ██║   ██║   ██║██║╚██╔╝██║██║██║            ║"
    echo "║     ██║ ╚████║   ██║   ╚██████╔╝██║ ╚═╝ ██║██║╚██████╗       ║"
    echo "║     ╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝     ╚═╝╚═╝ ╚═════╝       ║"
    echo "║                                                              ║"
    echo "║          Atomic-UI Management Script v${SCRIPT_VERSION}              ║"
    echo "║          Outline VPN Management Panel                        ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
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

# Generate random port
generate_random_port() {
    while true; do
        PORT=$((RANDOM % 55000 + 10000))
        if ! lsof -i :$PORT > /dev/null 2>&1; then
            echo $PORT
            return
        fi
    done
}

# Check system requirements
check_system() {
    print_step "Checking system requirements..."

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

    ARCH=$(uname -m)
    if [[ "$ARCH" != "x86_64" && "$ARCH" != "aarch64" ]]; then
        print_error "Unsupported architecture: $ARCH"
        exit 1
    fi

    print_success "System check passed: $OS $VERSION ($ARCH)"
}

# Check for port conflicts
check_port_conflict() {
    local PORT_TO_CHECK=$1
    
    if lsof -i :${PORT_TO_CHECK} > /dev/null 2>&1; then
        # Check if it's our own service
        if lsof -i :${PORT_TO_CHECK} | grep -q "node"; then
            return 0  # It's probably atomic-ui, OK
        fi
        
        print_warning "Port ${PORT_TO_CHECK} is already in use!"
        
        if lsof -i :${PORT_TO_CHECK} | grep -q docker; then
            print_warning "Docker container is using port ${PORT_TO_CHECK}"
            read -p "Do you want to stop Docker containers using this port? (y/n): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                CONTAINER_IDS=$(docker ps --filter "publish=${PORT_TO_CHECK}" -q 2>/dev/null)
                if [ -n "$CONTAINER_IDS" ]; then
                    docker stop $CONTAINER_IDS
                    print_success "Stopped Docker containers"
                fi
            else
                return 1
            fi
        else
            print_error "Another service is using port ${PORT_TO_CHECK}"
            lsof -i :${PORT_TO_CHECK}
            return 1
        fi
    fi
    return 0
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

# Install npm dependencies
install_npm_deps() {
    print_step "Installing npm dependencies (clean install)..."
    cd "$INSTALL_DIR"
    rm -rf node_modules .next package-lock.json
    npm install --production=false
    print_success "npm dependencies installed"
}

# Setup environment
setup_environment() {
    local NEW_PORT=$1
    print_step "Setting up environment..."

    cd "$INSTALL_DIR"

    if [ ! -f .env ]; then
        cp .env.example .env
        JWT_SECRET=$(openssl rand -base64 32)
        sed -i "s|your-super-secret-jwt-key-change-this-in-production|${JWT_SECRET}|g" .env
    fi
    
    SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "localhost")
    
    # Update port in .env
    if grep -q "^PORT=" .env; then
        sed -i "s|^PORT=.*|PORT=${NEW_PORT}|g" .env
    else
        echo "PORT=${NEW_PORT}" >> .env
    fi
    
    # Update APP_URL with new port
    sed -i "s|http://localhost:[0-9]*|http://${SERVER_IP}:${NEW_PORT}|g" .env
    sed -i "s|http://${SERVER_IP}:[0-9]*|http://${SERVER_IP}:${NEW_PORT}|g" .env

    # Save port to file
    echo "${NEW_PORT}" > "$INSTALL_DIR/.panel_port"

    print_success "Environment configured with port ${NEW_PORT}"
}

# Setup database
setup_database() {
    print_step "Setting up database..."
    cd "$INSTALL_DIR"
    mkdir -p prisma/data
    npx prisma generate
    npx prisma db push
    npm run setup
    print_success "Database setup complete"
}

# Build application
build_app() {
    print_step "Building application..."
    cd "$INSTALL_DIR"
    rm -rf .next
    npm run build
    print_success "Application built successfully"
}

# Create systemd service with specified port
create_service() {
    local PORT=$1
    print_step "Creating systemd service with port ${PORT}..."

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
Environment=PORT=${PORT}

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME}
    systemctl start ${SERVICE_NAME}

    print_success "Service created and started on port ${PORT}"
}

# Install management script globally
install_management_script() {
    print_step "Installing management script..."
    cp "$INSTALL_DIR/atomic-ui.sh" /usr/local/bin/atomic-ui
    chmod +x /usr/local/bin/atomic-ui
    print_success "Management script installed. Use 'atomic-ui' command to manage."
}

# Setup firewall
setup_firewall() {
    local PORT=$1
    print_step "Configuring firewall for port ${PORT}..."

    if command -v ufw &> /dev/null; then
        ufw allow ${PORT}/tcp > /dev/null 2>&1
        print_success "Firewall rule added for port ${PORT}"
    else
        print_warning "UFW not found, skipping firewall configuration"
    fi
}

# Print completion message
print_completion() {
    local PORT=$1
    SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "YOUR_SERVER_IP")

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              INSTALLATION COMPLETE!                          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}┌──────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}  ${YELLOW}Access your panel:${NC}"
    echo -e "${CYAN}│${NC}  URL: ${GREEN}http://${SERVER_IP}:${PORT}${NC}"
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC}  ${YELLOW}Your panel port:${NC} ${GREEN}${PORT}${NC}"
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC}  ${YELLOW}Default login credentials:${NC}"
    echo -e "${CYAN}│${NC}  Username: ${GREEN}admin${NC}"
    echo -e "${CYAN}│${NC}  Password: ${GREEN}admin123${NC}"
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC}  ${RED}⚠ IMPORTANT: Change the password after first login!${NC}"
    echo -e "${CYAN}└──────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "${YELLOW}  Management:${NC}"
    echo -e "  Run ${BLUE}atomic-ui${NC} to access the management menu"
    echo -e "  Run ${BLUE}atomic-ui port${NC} to view/change the port"
    echo ""
}

# ============================================
# Management Functions
# ============================================

# Start service
start_service() {
    print_step "Starting Atomic-UI..."
    systemctl start ${SERVICE_NAME}
    sleep 2
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
    CURRENT_PORT=$(get_current_port)
    CURRENT_PATH=$(get_current_path)
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "Unknown")
    
    echo ""
    echo -e "${CYAN}┌──────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}  ${YELLOW}Atomic-UI Service Status${NC}"
    echo -e "${CYAN}├──────────────────────────────────────────────────────────────┤${NC}"
    
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        echo -e "${CYAN}│${NC}  Status:     ${GREEN}● Running${NC}"
    else
        echo -e "${CYAN}│${NC}  Status:     ${RED}○ Stopped${NC}"
    fi
    
    if systemctl is-enabled --quiet ${SERVICE_NAME} 2>/dev/null; then
        echo -e "${CYAN}│${NC}  Auto-start: ${GREEN}Enabled${NC}"
    else
        echo -e "${CYAN}│${NC}  Auto-start: ${YELLOW}Disabled${NC}"
    fi
    
    echo -e "${CYAN}│${NC}  Port:       ${BLUE}${CURRENT_PORT}${NC}"
    if [ -n "$CURRENT_PATH" ]; then
        echo -e "${CYAN}│${NC}  Path:       ${BLUE}${CURRENT_PATH}${NC}"
        echo -e "${CYAN}│${NC}  Panel URL:  ${GREEN}http://${SERVER_IP}:${CURRENT_PORT}${CURRENT_PATH}/${NC}"
    else
        echo -e "${CYAN}│${NC}  Panel URL:  ${GREEN}http://${SERVER_IP}:${CURRENT_PORT}${NC}"
    fi
    
    if [ -d "$INSTALL_DIR" ]; then
        if [ -f "$INSTALL_DIR/package.json" ]; then
            VERSION=$(grep '"version"' "$INSTALL_DIR/package.json" | cut -d'"' -f4)
            echo -e "${CYAN}│${NC}  Version:    ${BLUE}${VERSION}${NC}"
        fi
    else
        echo -e "${CYAN}│${NC}  Install:    ${RED}Not Found${NC}"
    fi
    
    echo -e "${CYAN}└──────────────────────────────────────────────────────────────┘${NC}"
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

# ============================================
# Port Management
# ============================================

# Change port
change_port() {
    local NEW_PORT=$1
    CURRENT_PORT=$(get_current_port)
    
    echo ""
    echo -e "${CYAN}Port Management${NC}"
    echo -e "${CYAN}────────────────${NC}"
    echo -e "Current port: ${GREEN}${CURRENT_PORT}${NC}"
    echo ""
    
    if [ -z "$NEW_PORT" ]; then
        # Interactive mode
        read -p "Enter new port (10000-65000) or press Enter to keep current: " NEW_PORT
        
        if [ -z "$NEW_PORT" ]; then
            print_info "Keeping current port: ${CURRENT_PORT}"
            return
        fi
    fi
    
    # Validate port number
    if ! [[ "$NEW_PORT" =~ ^[0-9]+$ ]] || [ "$NEW_PORT" -lt 1 ] || [ "$NEW_PORT" -gt 65535 ]; then
        print_error "Invalid port number: ${NEW_PORT}"
        return 1
    fi
    
    if [ "$NEW_PORT" -lt 1024 ]; then
        print_warning "Ports below 1024 may require special permissions"
    fi
    
    if [ "$NEW_PORT" == "$CURRENT_PORT" ]; then
        print_info "Port is already set to ${NEW_PORT}"
        return
    fi
    
    # Check if new port is available
    if ! check_port_conflict "$NEW_PORT"; then
        print_error "Cannot use port ${NEW_PORT}"
        return 1
    fi
    
    print_step "Changing port from ${CURRENT_PORT} to ${NEW_PORT}..."
    
    # Stop service
    systemctl stop ${SERVICE_NAME}
    
    # Remove old firewall rule
    if command -v ufw &> /dev/null; then
        ufw delete allow ${CURRENT_PORT}/tcp > /dev/null 2>&1
    fi
    
    # Update .env
    cd "$INSTALL_DIR"
    if grep -q "^PORT=" .env; then
        sed -i "s|^PORT=.*|PORT=${NEW_PORT}|g" .env
    else
        echo "PORT=${NEW_PORT}" >> .env
    fi
    
    # Update APP_URL
    SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "localhost")
    sed -i "s|http://${SERVER_IP}:[0-9]*|http://${SERVER_IP}:${NEW_PORT}|g" .env
    
    # Save new port
    echo "${NEW_PORT}" > "$INSTALL_DIR/.panel_port"
    
    # Update systemd service
    sed -i "s|Environment=PORT=.*|Environment=PORT=${NEW_PORT}|g" /etc/systemd/system/${SERVICE_NAME}.service
    systemctl daemon-reload
    
    # Add new firewall rule
    if command -v ufw &> /dev/null; then
        ufw allow ${NEW_PORT}/tcp > /dev/null 2>&1
        print_success "Firewall updated for port ${NEW_PORT}"
    fi
    
    # Start service
    systemctl start ${SERVICE_NAME}
    sleep 2
    
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        print_success "Port changed successfully!"
        echo ""
        echo -e "New panel URL: ${GREEN}http://${SERVER_IP}:${NEW_PORT}${NC}"
        echo ""
    else
        print_error "Service failed to start with new port"
        systemctl status ${SERVICE_NAME}
    fi
}

# Show port info
show_port() {
    CURRENT_PORT=$(get_current_port)
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
    
    echo ""
    echo -e "${CYAN}┌──────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}  ${YELLOW}Port Information${NC}"
    echo -e "${CYAN}├──────────────────────────────────────────────────────────────┤${NC}"
    echo -e "${CYAN}│${NC}  Current Port: ${GREEN}${CURRENT_PORT}${NC}"
    echo -e "${CYAN}│${NC}  Panel URL:    ${GREEN}http://${SERVER_IP}:${CURRENT_PORT}${NC}"
    echo -e "${CYAN}└──────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "To change port, run: ${BLUE}atomic-ui port <new-port>${NC}"
    echo ""
}

# Update to latest version
update_service() {
    print_step "Updating Atomic-UI to latest version..."
    
    if [ ! -d "$INSTALL_DIR" ]; then
        print_error "Atomic-UI is not installed"
        exit 1
    fi
    
    CURRENT_PORT=$(get_current_port)
    cd "$INSTALL_DIR"
    
    systemctl stop ${SERVICE_NAME}
    
    print_step "Backing up configuration..."
    cp .env .env.backup 2>/dev/null || true
    cp -r prisma/data prisma/data.backup 2>/dev/null || true
    cp .panel_port .panel_port.backup 2>/dev/null || true
    
    print_step "Downloading latest version..."
    git fetch origin
    git reset --hard origin/main
    
    # Restore backups
    cp .env.backup .env 2>/dev/null || true
    cp .panel_port.backup .panel_port 2>/dev/null || true
    
    print_step "Installing dependencies..."
    rm -rf node_modules .next package-lock.json
    npm install --production=false
    
    print_step "Updating database..."
    npx prisma generate
    npx prisma db push
    
    print_step "Building application..."
    npm run build
    
    # Update management script
    cp "$INSTALL_DIR/atomic-ui.sh" /usr/local/bin/atomic-ui
    chmod +x /usr/local/bin/atomic-ui
    
    systemctl start ${SERVICE_NAME}
    
    print_success "Atomic-UI updated successfully!"
    show_status
}

# Uninstall
uninstall_service() {
    CURRENT_PORT=$(get_current_port)
    
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
    
    # Remove firewall rule
    if command -v ufw &> /dev/null; then
        ufw delete allow ${CURRENT_PORT}/tcp > /dev/null 2>&1
    fi
    
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
    echo -e "  ${GREEN}6)${NC} Change Port"
    echo ""
    echo -e "  ${GREEN}7)${NC} Enable Auto-start"
    echo -e "  ${GREEN}8)${NC} Disable Auto-start"
    echo ""
    echo -e "  ${GREEN}9)${NC} Update Atomic-UI"
    echo -e "  ${GREEN}10)${NC} Reinstall Atomic-UI"
    echo ""
    echo -e "  ${RED}11)${NC} Uninstall Atomic-UI"
    echo ""
    echo -e "  ${GREEN}0)${NC} Exit"
    echo ""
    
    read -p "Please enter your choice [0-11]: " choice
    
    case $choice in
        1) start_service ;;
        2) stop_service ;;
        3) restart_service ;;
        4) show_logs ;;
        5) show_status ;;
        6) change_port ;;
        7) enable_service ;;
        8) disable_service ;;
        9) update_service ;;
        10) install_full ;;
        11) uninstall_service ;;
        0) exit 0 ;;
        *) print_error "Invalid option" ;;
    esac
}

# Full installation
install_full() {
    print_banner
    
    # Generate random port
    NEW_PORT=$(generate_random_port)
    print_info "Generated random port: ${NEW_PORT}"
    
    check_root
    check_system
    check_port_conflict "$NEW_PORT"
    install_dependencies
    install_nodejs
    setup_repository
    install_npm_deps
    setup_environment "$NEW_PORT"
    setup_database
    build_app
    create_service "$NEW_PORT"
    install_management_script
    setup_firewall "$NEW_PORT"

    print_completion "$NEW_PORT"
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
        port)
            if [ -z "$2" ]; then
                show_port
            else
                check_root
                change_port "$2"
            fi
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
            echo "  port       - Show current port"
            echo "  port <num> - Change port to <num>"
            echo "  enable     - Enable auto-start"
            echo "  disable    - Disable auto-start"
            echo ""
            echo "Run without arguments to show interactive menu."
            ;;
    esac
}

# Run main function
main "$@"
