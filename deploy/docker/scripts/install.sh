#!/bin/bash

# ============================================
# Worklenz One-Command Installation Script
# ============================================
# Production-grade self-hosted deployment
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Worklenz/worklenz/main/deploy/docker/scripts/install.sh | bash
#
# Or download and run locally:
#   wget https://raw.githubusercontent.com/Worklenz/worklenz/main/deploy/docker/scripts/install.sh
#   chmod +x install.sh
#   ./install.sh
# ============================================

set -e

# ============================================
# Configuration
# ============================================
WORKLENZ_VERSION="1.5.0"
REQUIRED_DOCKER_VERSION="20.10"
REQUIRED_COMPOSE_VERSION="2.0"
REQUIRED_RAM_GB=4
REQUIRED_DISK_GB=20
REQUIRED_CPU_CORES=2

GITHUB_REPO="Worklenz/worklenz"
GITHUB_BRANCH="main"
INSTALL_DIR="${INSTALL_DIR:-/opt/worklenz}"

# ============================================
# Colors and Formatting
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ============================================
# Helper Functions - Output
# ============================================

print_banner() {
    echo ""
    echo -e "${CYAN}${BOLD}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                                                            ║"
    echo "║                  WORKLENZ INSTALLER                        ║"
    echo "║                                                            ║"
    echo "║          Production-Grade Self-Hosted Deployment          ║"
    echo "║                    Version ${WORKLENZ_VERSION}                         ║"
    echo "║                                                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
}

print_header() {
    echo ""
    echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}${BOLD}$1${NC}"
    echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_step() {
    echo -e "${MAGENTA}▶${NC} $1"
}

# ============================================
# Helper Functions - System
# ============================================

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    elif [ -f /etc/redhat-release ]; then
        OS="rhel"
    elif [ -f /etc/debian_version ]; then
        OS="debian"
    else
        OS="unknown"
    fi

    ARCH=$(uname -m)

    case "$ARCH" in
        x86_64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        *)
            print_error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac
}

# Check if running as root
check_root() {
    if [ "$EUID" -eq 0 ]; then
        IS_ROOT=true
        SUDO=""
    else
        IS_ROOT=false
        SUDO="sudo"
    fi
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Get system info
get_cpu_cores() {
    nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "1"
}

get_ram_gb() {
    local ram_kb
    if [ -f /proc/meminfo ]; then
        ram_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        echo $((ram_kb / 1024 / 1024))
    else
        # macOS fallback
        sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1024/1024/1024)}' || echo "0"
    fi
}

get_disk_available_gb() {
    local disk_kb=$(df -k "$INSTALL_DIR" 2>/dev/null | awk 'NR==2 {print $4}')
    if [ -z "$disk_kb" ]; then
        disk_kb=$(df -k / | awk 'NR==2 {print $4}')
    fi
    echo $((disk_kb / 1024 / 1024))
}

# Version comparison
version_ge() {
    printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

# ============================================
# System Requirements Check
# ============================================

check_system_requirements() {
    print_header "System Requirements Check"

    local all_ok=true

    # CPU cores
    print_step "Checking CPU cores..."
    local cpu_cores=$(get_cpu_cores)
    if [ "$cpu_cores" -ge "$REQUIRED_CPU_CORES" ]; then
        print_success "CPU: $cpu_cores cores (minimum: $REQUIRED_CPU_CORES)"
    else
        print_warning "CPU: $cpu_cores cores (recommended: $REQUIRED_CPU_CORES)"
    fi

    # RAM
    print_step "Checking RAM..."
    local ram_gb=$(get_ram_gb)
    if [ "$ram_gb" -ge "$REQUIRED_RAM_GB" ]; then
        print_success "RAM: ${ram_gb}GB (minimum: ${REQUIRED_RAM_GB}GB)"
    else
        print_error "RAM: ${ram_gb}GB (minimum required: ${REQUIRED_RAM_GB}GB)"
        all_ok=false
    fi

    # Disk space
    print_step "Checking disk space..."
    local disk_gb=$(get_disk_available_gb)
    if [ "$disk_gb" -ge "$REQUIRED_DISK_GB" ]; then
        print_success "Disk: ${disk_gb}GB available (minimum: ${REQUIRED_DISK_GB}GB)"
    else
        print_error "Disk: ${disk_gb}GB available (minimum required: ${REQUIRED_DISK_GB}GB)"
        all_ok=false
    fi

    # Architecture
    print_step "Checking architecture..."
    print_success "Architecture: $ARCH"

    # OS
    print_step "Checking operating system..."
    print_success "OS: $OS $OS_VERSION"

    if [ "$all_ok" = false ]; then
        echo ""
        print_error "System requirements not met. Please upgrade your system."
        exit 1
    fi

    echo ""
    print_success "System requirements check passed!"
}

# ============================================
# Docker Installation
# ============================================

check_docker() {
    print_header "Docker Check"

    if command_exists docker; then
        local docker_version=$(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)
        print_info "Docker installed: $docker_version"

        if version_ge "$docker_version" "$REQUIRED_DOCKER_VERSION"; then
            print_success "Docker version is compatible"
            DOCKER_INSTALLED=true
        else
            print_warning "Docker version $docker_version is below recommended $REQUIRED_DOCKER_VERSION"
            DOCKER_INSTALLED=true
        fi
    else
        print_warning "Docker is not installed"
        DOCKER_INSTALLED=false
    fi
}

install_docker() {
    print_header "Installing Docker"

    print_step "Updating package index..."
    $SUDO apt-get update -qq

    print_step "Installing prerequisites..."
    $SUDO apt-get install -y -qq \
        ca-certificates \
        curl \
        gnupg \
        lsb-release

    print_step "Adding Docker's official GPG key..."
    $SUDO mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$OS/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg

    print_step "Setting up Docker repository..."
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
        $(lsb_release -cs) stable" | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null

    print_step "Installing Docker Engine..."
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    print_step "Starting Docker service..."
    $SUDO systemctl start docker
    $SUDO systemctl enable docker

    # Add current user to docker group
    if [ "$IS_ROOT" = false ]; then
        print_step "Adding user to docker group..."
        $SUDO usermod -aG docker $USER
        print_warning "You may need to log out and back in for docker group changes to take effect"
    fi

    print_success "Docker installed successfully!"
}

check_docker_compose() {
    print_header "Docker Compose Check"

    # Check for docker compose (v2 - plugin)
    if docker compose version >/dev/null 2>&1; then
        local compose_version=$(docker compose version | grep -oP '\d+\.\d+\.\d+' | head -1)
        print_info "Docker Compose installed: $compose_version"

        if version_ge "$compose_version" "$REQUIRED_COMPOSE_VERSION"; then
            print_success "Docker Compose version is compatible"
            COMPOSE_INSTALLED=true
            COMPOSE_CMD="docker compose"
        else
            print_warning "Docker Compose version $compose_version is below recommended $REQUIRED_COMPOSE_VERSION"
            COMPOSE_INSTALLED=true
            COMPOSE_CMD="docker compose"
        fi
    # Check for docker-compose (v1 - standalone)
    elif command_exists docker-compose; then
        local compose_version=$(docker-compose --version | grep -oP '\d+\.\d+\.\d+' | head -1)
        print_info "Docker Compose (v1) installed: $compose_version"
        print_warning "Using legacy docker-compose. Consider upgrading to Docker Compose v2."
        COMPOSE_INSTALLED=true
        COMPOSE_CMD="docker-compose"
    else
        print_warning "Docker Compose is not installed"
        COMPOSE_INSTALLED=false
    fi
}

# ============================================
# Input Helpers
# ============================================

prompt() {
    local prompt_text="$1"
    local default_value="$2"
    local user_input

    if [ -n "$default_value" ]; then
        read -p "$(echo -e ${CYAN}$prompt_text ${BOLD}[$default_value]${NC}: ) " user_input
        echo "${user_input:-$default_value}"
    else
        read -p "$(echo -e ${CYAN}$prompt_text${NC}: ) " user_input
        echo "$user_input"
    fi
}

prompt_password() {
    local prompt_text="$1"
    local user_input

    read -s -p "$(echo -e ${CYAN}$prompt_text${NC}: ) " user_input
    echo "$user_input"
    echo "" # New line after hidden input
}

prompt_yn() {
    local prompt_text="$1"
    local default_value="${2:-Y}"
    local user_input

    while true; do
        read -p "$(echo -e ${CYAN}$prompt_text ${BOLD}[Y/n]${NC}: ) " user_input
        user_input="${user_input:-$default_value}"

        case "$user_input" in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Please answer Y or n.";;
        esac
    done
}

prompt_choice() {
    local prompt_text="$1"
    local default_value="$2"
    shift 2
    local options=("$@")
    local user_input

    read -p "$(echo -e ${CYAN}$prompt_text ${BOLD}[$default_value]${NC}: ) " user_input
    echo "${user_input:-$default_value}"
}

# Generate random string
generate_secret() {
    local length=${1:-64}
    openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length
}

# Generate random password
generate_password() {
    local length=${1:-32}
    openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length
}

# ============================================
# Configuration Wizard
# ============================================

run_configuration_wizard() {
    print_header "Configuration Wizard"

    # Installation mode
    echo -e "${BOLD}Select Installation Mode:${NC}"
    echo "  1) Express    - Quick setup with all services embedded (recommended)"
    echo "  2) Advanced   - Custom configuration with external services option"
    echo ""

    MODE_CHOICE=$(prompt_choice "Select mode" "1")

    case $MODE_CHOICE in
        1)
            INSTALLATION_MODE="express"
            configure_express_mode
            ;;
        2)
            INSTALLATION_MODE="advanced"
            configure_advanced_mode
            ;;
        *)
            print_error "Invalid selection"
            exit 1
            ;;
    esac
}

configure_express_mode() {
    print_header "Express Mode Configuration"

    print_info "Express mode uses embedded services for quick setup"
    echo ""

    # Domain
    DOMAIN=$(prompt "Enter your domain or IP address" "localhost")

    # SSL
    if prompt_yn "Enable SSL/HTTPS (requires valid domain and port 80/443 access)"; then
        USE_SSL=true
        FRONTEND_URL="https://${DOMAIN}"
        BACKEND_URL="https://${DOMAIN}/api"
        SOCKET_URL="wss://${DOMAIN}"
        SESSION_COOKIE_SECURE="true"
        HTTP_PORT=80
        HTTPS_PORT=443
    else
        USE_SSL=false
        FRONTEND_URL="http://${DOMAIN}"
        BACKEND_URL="http://${DOMAIN}/api"
        SOCKET_URL="ws://${DOMAIN}"
        SESSION_COOKIE_SECURE="false"
        HTTP_PORT=$(prompt "HTTP port" "80")
        HTTPS_PORT=443
    fi

    # Admin account
    ADMIN_EMAIL=$(prompt "Admin email address" "admin@example.com")
    CONTACT_EMAIL=$(prompt "Support/contact email" "support@example.com")

    # Email configuration
    if prompt_yn "Configure email/SMTP now (optional, can be done later)"; then
        configure_email
    else
        EMAIL_ENABLED=false
    fi

    # Use embedded services
    DATABASE_TYPE="embedded"
    REDIS_TYPE="embedded"
    MINIO_TYPE="embedded"
    STORAGE_PROVIDER="minio"
}

configure_advanced_mode() {
    print_header "Advanced Mode Configuration"

    # Domain
    DOMAIN=$(prompt "Enter your domain or IP address" "localhost")

    # SSL
    if prompt_yn "Enable SSL/HTTPS"; then
        USE_SSL=true
        FRONTEND_URL="https://${DOMAIN}"
        BACKEND_URL="https://${DOMAIN}/api"
        SOCKET_URL="wss://${DOMAIN}"
        SESSION_COOKIE_SECURE="true"

        if prompt_yn "Use custom SSL certificate (otherwise use Let's Encrypt)"; then
            SSL_CERT_PATH=$(prompt "SSL certificate path" "")
            SSL_KEY_PATH=$(prompt "SSL key path" "")
        else
            SETUP_LETSENCRYPT=true
        fi
    else
        USE_SSL=false
        FRONTEND_URL="http://${DOMAIN}"
        BACKEND_URL="http://${DOMAIN}/api"
        SOCKET_URL="ws://${DOMAIN}"
        SESSION_COOKIE_SECURE="false"
    fi

    # Ports
    HTTP_PORT=$(prompt "HTTP port" "80")
    HTTPS_PORT=$(prompt "HTTPS port" "443")

    # Storage backend
    configure_storage_backend

    # Database
    if prompt_yn "Use embedded PostgreSQL database"; then
        DATABASE_TYPE="embedded"
    else
        DATABASE_TYPE="external"
        configure_external_database
    fi

    # Redis
    if prompt_yn "Use embedded Redis cache"; then
        REDIS_TYPE="embedded"
    else
        REDIS_TYPE="external"
        configure_external_redis
    fi

    # Admin account
    ADMIN_EMAIL=$(prompt "Admin email address" "admin@example.com")
    CONTACT_EMAIL=$(prompt "Support/contact email" "support@example.com")

    # Email
    if prompt_yn "Configure email/SMTP"; then
        configure_email
    else
        EMAIL_ENABLED=false
    fi
}

configure_storage_backend() {
    print_header "Storage Backend Configuration"

    echo -e "${BOLD}Select Storage Backend:${NC}"
    echo "  1) Embedded MinIO    - Self-hosted, runs in Docker (recommended for < 50GB)"
    echo "  2) External MinIO    - Connect to external MinIO instance"
    echo "  3) AWS S3            - Amazon S3 storage"
    echo "  4) Azure Blob        - Microsoft Azure Blob Storage"
    echo ""

    STORAGE_CHOICE=$(prompt_choice "Select storage" "1")

    case $STORAGE_CHOICE in
        1)
            MINIO_TYPE="embedded"
            STORAGE_PROVIDER="minio"
            print_success "Using embedded MinIO"
            ;;
        2)
            MINIO_TYPE="external"
            STORAGE_PROVIDER="s3"
            S3_ENDPOINT=$(prompt "MinIO endpoint URL" "https://minio.example.com")
            S3_REGION=$(prompt "Region" "us-east-1")
            S3_BUCKET=$(prompt "Bucket name" "worklenz-files")
            S3_ACCESS_KEY_ID=$(prompt "Access key ID" "")
            S3_SECRET_ACCESS_KEY=$(prompt_password "Secret access key")
            S3_USE_SSL=true
            S3_FORCE_PATH_STYLE=true
            ;;
        3)
            STORAGE_PROVIDER="s3"
            MINIO_TYPE="external"
            S3_ENDPOINT="https://s3.amazonaws.com"
            S3_REGION=$(prompt "AWS region" "us-east-1")
            S3_BUCKET=$(prompt "S3 bucket name" "worklenz-files")
            S3_ACCESS_KEY_ID=$(prompt "AWS access key ID" "")
            S3_SECRET_ACCESS_KEY=$(prompt_password "AWS secret access key")
            S3_USE_SSL=true
            S3_FORCE_PATH_STYLE=false
            ;;
        4)
            STORAGE_PROVIDER="azure"
            MINIO_TYPE="external"
            AZURE_STORAGE_ACCOUNT_NAME=$(prompt "Azure storage account name" "")
            AZURE_STORAGE_CONTAINER=$(prompt "Container name" "worklenz-files")
            AZURE_STORAGE_ACCOUNT_KEY=$(prompt_password "Account key")
            ;;
        *)
            print_error "Invalid selection"
            exit 1
            ;;
    esac
}

configure_external_database() {
    print_info "External PostgreSQL configuration"
    DB_HOST=$(prompt "Database host" "")
    DB_PORT=$(prompt "Database port" "5432")
    DB_NAME=$(prompt "Database name" "worklenz_db")
    DB_USER=$(prompt "Database user" "worklenz")
    DB_PASSWORD=$(prompt_password "Database password")
    DB_SSL_MODE=$(prompt "SSL mode (disable/require/verify-full)" "prefer")
}

configure_external_redis() {
    print_info "External Redis configuration"
    REDIS_HOST=$(prompt "Redis host" "")
    REDIS_PORT=$(prompt "Redis port" "6379")
    REDIS_PASSWORD=$(prompt_password "Redis password")
    REDIS_DB=$(prompt "Redis database number" "0")
}

configure_email() {
    EMAIL_ENABLED=true

    echo ""
    echo -e "${BOLD}Select Email Provider:${NC}"
    echo "  1) SMTP       - Standard SMTP server"
    echo "  2) AWS SES    - Amazon Simple Email Service"
    echo ""

    EMAIL_CHOICE=$(prompt_choice "Select provider" "1")

    case $EMAIL_CHOICE in
        1)
            EMAIL_PROVIDER="smtp"
            SMTP_HOST=$(prompt "SMTP host" "smtp.gmail.com")
            SMTP_PORT=$(prompt "SMTP port" "587")
            if prompt_yn "Use secure connection (TLS)"; then
                SMTP_SECURE=true
            else
                SMTP_SECURE=false
            fi
            SMTP_USER=$(prompt "SMTP username" "")
            SMTP_PASSWORD=$(prompt_password "SMTP password")
            SMTP_FROM_EMAIL=$(prompt "From email address" "$CONTACT_EMAIL")
            SMTP_FROM_NAME=$(prompt "From name" "Worklenz")
            ;;
        2)
            EMAIL_PROVIDER="ses"
            AWS_SES_REGION=$(prompt "AWS SES region" "us-east-1")
            AWS_SES_ACCESS_KEY_ID=$(prompt "AWS access key ID" "")
            AWS_SES_SECRET_ACCESS_KEY=$(prompt_password "AWS secret access key")
            SMTP_FROM_EMAIL=$(prompt "From email address" "$CONTACT_EMAIL")
            ;;
    esac
}

# ============================================
# Generate Configuration File
# ============================================

generate_config_file() {
    print_header "Generating Configuration"

    # Generate secrets
    print_step "Generating secure secrets..."
    SESSION_SECRET=$(generate_secret 64)
    COOKIE_SECRET=$(generate_secret 64)
    JWT_SECRET=$(generate_secret 64)
    CSRF_SECRET=$(generate_secret 64)

    # Generate passwords for embedded services
    if [ "$DATABASE_TYPE" = "embedded" ]; then
        DB_PASSWORD=$(generate_password 32)
    fi

    if [ "$REDIS_TYPE" = "embedded" ]; then
        REDIS_PASSWORD=$(generate_password 32)
    fi

    if [ "$MINIO_TYPE" = "embedded" ]; then
        MINIO_PASSWORD=$(generate_password 32)
    fi

    ADMIN_PASSWORD=$(generate_password 16)

    print_success "Secrets generated"

    # Create config file
    print_step "Creating worklenz.env..."

    cat > "${INSTALL_DIR}/worklenz.env" << EOF
# ============================================
# WORKLENZ PRODUCTION CONFIGURATION
# ============================================
# Auto-generated on $(date)
# Installation Mode: $INSTALLATION_MODE

# ============================================
# CORE CONFIGURATION
# ============================================
WORKLENZ_VERSION=${WORKLENZ_VERSION}
NODE_ENV=production
INSTALLATION_MODE=${INSTALLATION_MODE}

# Domain & URLs
DOMAIN=${DOMAIN}
FRONTEND_URL=${FRONTEND_URL}
BACKEND_URL=${BACKEND_URL}
SOCKET_URL=${SOCKET_URL}
USE_SSL=${USE_SSL}

# Ports
HTTP_PORT=${HTTP_PORT}
HTTPS_PORT=${HTTPS_PORT:-443}
BACKEND_PORT=3000
FRONTEND_PORT=5000

# ============================================
# DATABASE CONFIGURATION
# ============================================
DATABASE_TYPE=${DATABASE_TYPE}
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-worklenz_db}
DB_USER=${DB_USER:-worklenz}
DB_PASSWORD=${DB_PASSWORD}
DB_MAX_CONNECTIONS=50
DB_SSL_MODE=${DB_SSL_MODE:-prefer}

# ============================================
# REDIS CONFIGURATION
# ============================================
REDIS_TYPE=${REDIS_TYPE}
REDIS_HOST=${REDIS_HOST:-redis}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_DB=${REDIS_DB:-0}
REDIS_MAX_MEMORY=256mb
REDIS_EVICTION_POLICY=allkeys-lru

# ============================================
# STORAGE CONFIGURATION
# ============================================
STORAGE_PROVIDER=${STORAGE_PROVIDER}

EOF

    # Storage configuration based on provider
    if [ "$STORAGE_PROVIDER" = "minio" ] || [ "$MINIO_TYPE" = "embedded" ]; then
        cat >> "${INSTALL_DIR}/worklenz.env" << EOF
# MinIO Configuration
MINIO_TYPE=${MINIO_TYPE}
MINIO_ENDPOINT=http://minio:9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}
MINIO_BUCKET=worklenz-bucket
MINIO_USE_SSL=false

# S3 Configuration (for MinIO)
S3_URL=http://minio:9000/worklenz-bucket
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=worklenz-bucket
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=${MINIO_PASSWORD}
S3_FORCE_PATH_STYLE=true
S3_USE_SSL=false

EOF
    elif [ "$STORAGE_PROVIDER" = "s3" ]; then
        cat >> "${INSTALL_DIR}/worklenz.env" << EOF
# S3 Configuration
S3_ENDPOINT=${S3_ENDPOINT}
S3_REGION=${S3_REGION}
S3_BUCKET=${S3_BUCKET}
S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
S3_FORCE_PATH_STYLE=${S3_FORCE_PATH_STYLE:-false}
S3_USE_SSL=${S3_USE_SSL:-true}
S3_URL=https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com

EOF
    elif [ "$STORAGE_PROVIDER" = "azure" ]; then
        cat >> "${INSTALL_DIR}/worklenz.env" << EOF
# Azure Blob Storage Configuration
AZURE_STORAGE_ACCOUNT_NAME=${AZURE_STORAGE_ACCOUNT_NAME}
AZURE_STORAGE_CONTAINER=${AZURE_STORAGE_CONTAINER}
AZURE_STORAGE_ACCOUNT_KEY=${AZURE_STORAGE_ACCOUNT_KEY}
AZURE_STORAGE_URL=https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net

EOF
    fi

    # Continue with rest of configuration
    cat >> "${INSTALL_DIR}/worklenz.env" << EOF
# ============================================
# AUTHENTICATION & SECURITY
# ============================================
SESSION_SECRET=${SESSION_SECRET}
SESSION_NAME=worklenz.sid
SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE}
SESSION_COOKIE_MAX_AGE=86400000

COOKIE_SECRET=${COOKIE_SECRET}
JWT_SECRET=${JWT_SECRET}
CSRF_SECRET=${CSRF_SECRET}

TRUST_PROXY=true
HELMET_ENABLED=true
COMPRESSION_ENABLED=true

# ============================================
# EMAIL CONFIGURATION
# ============================================
EMAIL_ENABLED=${EMAIL_ENABLED:-false}
EMAIL_PROVIDER=${EMAIL_PROVIDER:-smtp}

EOF

    if [ "$EMAIL_ENABLED" = true ]; then
        if [ "$EMAIL_PROVIDER" = "smtp" ]; then
            cat >> "${INSTALL_DIR}/worklenz.env" << EOF
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_SECURE=${SMTP_SECURE}
SMTP_USER=${SMTP_USER}
SMTP_PASSWORD=${SMTP_PASSWORD}
SMTP_FROM_EMAIL=${SMTP_FROM_EMAIL}
SMTP_FROM_NAME=${SMTP_FROM_NAME}

EOF
        elif [ "$EMAIL_PROVIDER" = "ses" ]; then
            cat >> "${INSTALL_DIR}/worklenz.env" << EOF
AWS_SES_REGION=${AWS_SES_REGION}
AWS_SES_ACCESS_KEY_ID=${AWS_SES_ACCESS_KEY_ID}
AWS_SES_SECRET_ACCESS_KEY=${AWS_SES_SECRET_ACCESS_KEY}
AWS_REGION=${AWS_SES_REGION}
SMTP_FROM_EMAIL=${SMTP_FROM_EMAIL}

EOF
        fi
    fi

    cat >> "${INSTALL_DIR}/worklenz.env" << EOF
CONTACT_US_EMAIL=${CONTACT_EMAIL}
ADMIN_EMAIL=${ADMIN_EMAIL}

# ============================================
# FEATURES & WORKERS
# ============================================
ENABLE_WORKERS=true
ENABLE_EMAIL_CRONJOBS=${EMAIL_ENABLED:-false}
ENABLE_RECURRING_JOBS=true
RECURRING_JOBS_INTERVAL="0 11 */1 * 1-5"

# ============================================
# MONITORING & LOGGING
# ============================================
LOG_LEVEL=info
ENABLE_ACCESS_LOGS=true
ENABLE_METRICS=false
USE_PG_NATIVE=false

# ============================================
# RATE LIMITING
# ============================================
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ============================================
# CORS CONFIGURATION
# ============================================
CORS_ORIGIN=*
SERVER_CORS=*
SOCKET_IO_CORS=${FRONTEND_URL}

# ============================================
# ADMIN CONFIGURATION
# ============================================
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_INITIAL_PASSWORD=${ADMIN_PASSWORD}

# ============================================
# OPTIONAL INTEGRATIONS
# ============================================
GOOGLE_AUTH_ENABLED=false
GOOGLE_CAPTCHA_ENABLED=false
SLACK_NOTIFICATIONS_ENABLED=false
EOF

    print_success "Configuration file created"

    # Save credentials separately
    CREDENTIALS_FILE="${INSTALL_DIR}/.worklenz-credentials.txt"
    cat > "$CREDENTIALS_FILE" << EOF
Worklenz Installation Credentials
Generated: $(date)
================================

ACCESS INFORMATION:
Frontend URL: ${FRONTEND_URL}
Admin Email: ${ADMIN_EMAIL}
Admin Password: ${ADMIN_PASSWORD}

DATABASE:
Host: ${DB_HOST:-postgres (embedded)}
Password: ${DB_PASSWORD}

REDIS:
Host: ${REDIS_HOST:-redis (embedded)}
Password: ${REDIS_PASSWORD}

STORAGE (${STORAGE_PROVIDER}):
EOF

    if [ "$STORAGE_PROVIDER" = "minio" ]; then
        cat >> "$CREDENTIALS_FILE" << EOF
MinIO Password: ${MINIO_PASSWORD}
EOF
    fi

    cat >> "$CREDENTIALS_FILE" << EOF

SECURITY SECRETS:
Session Secret: ${SESSION_SECRET}
JWT Secret: ${JWT_SECRET}

IMPORTANT: Store these credentials securely!
Do not commit this file to version control.
EOF

    chmod 600 "$CREDENTIALS_FILE"
    print_success "Credentials saved to: $CREDENTIALS_FILE"
}

# ============================================
# Download Worklenz
# ============================================

download_worklenz() {
    print_header "Downloading Worklenz"

    # Create install directory
    print_step "Creating installation directory: $INSTALL_DIR"
    $SUDO mkdir -p "$INSTALL_DIR"

    # Change ownership to current user if using sudo
    if [ "$IS_ROOT" = false ]; then
        $SUDO chown -R $USER:$USER "$INSTALL_DIR"
    fi

    cd "$INSTALL_DIR"

    # Check if git is available
    if command_exists git; then
        print_step "Cloning Worklenz repository..."
        if [ -d "$INSTALL_DIR/.git" ]; then
            print_info "Repository already exists, pulling latest changes..."
            git pull origin $GITHUB_BRANCH
        else
            git clone --depth 1 --branch $GITHUB_BRANCH "https://github.com/${GITHUB_REPO}.git" .
        fi
    else
        print_step "Downloading Worklenz archive..."
        curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.tar.gz" -o worklenz.tar.gz
        tar -xzf worklenz.tar.gz --strip-components=1
        rm worklenz.tar.gz
    fi

    print_success "Worklenz downloaded"
}

# ============================================
# Setup SSL/TLS
# ============================================

setup_ssl() {
    if [ "$USE_SSL" != true ]; then
        return
    fi

    print_header "SSL/TLS Setup"

    if [ -n "$SSL_CERT_PATH" ] && [ -n "$SSL_KEY_PATH" ]; then
        print_step "Copying custom SSL certificates..."
        $SUDO mkdir -p "${INSTALL_DIR}/deploy/docker/nginx/ssl"
        $SUDO cp "$SSL_CERT_PATH" "${INSTALL_DIR}/deploy/docker/nginx/ssl/cert.pem"
        $SUDO cp "$SSL_KEY_PATH" "${INSTALL_DIR}/deploy/docker/nginx/ssl/key.pem"
        print_success "SSL certificates configured"
    elif [ "$SETUP_LETSENCRYPT" = true ]; then
        print_step "Setting up Let's Encrypt..."
        print_warning "Let's Encrypt setup requires certbot to be installed"

        if ! command_exists certbot; then
            print_info "Installing certbot..."
            $SUDO apt-get install -y certbot
        fi

        print_info "Obtaining SSL certificate for $DOMAIN..."
        print_warning "Make sure port 80 is accessible from the internet"

        $SUDO certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --email "$ADMIN_EMAIL"

        # Copy certificates to nginx directory
        $SUDO mkdir -p "${INSTALL_DIR}/deploy/docker/nginx/ssl"
        $SUDO cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${INSTALL_DIR}/deploy/docker/nginx/ssl/cert.pem"
        $SUDO cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "${INSTALL_DIR}/deploy/docker/nginx/ssl/key.pem"

        print_success "Let's Encrypt certificate obtained"
    else
        print_warning "SSL enabled but no certificate provided"
        print_info "You'll need to manually configure SSL certificates in deploy/docker/nginx/ssl/"
    fi

    # Enable HTTPS in nginx config
    if [ -f "${INSTALL_DIR}/deploy/docker/nginx/nginx.conf" ]; then
        print_step "Updating nginx configuration for SSL..."
        # Uncomment HTTPS server block (would need sed commands)
        print_info "HTTPS server block is available in nginx.conf (commented)"
    fi
}

# ============================================
# Start Services
# ============================================

start_services() {
    print_header "Starting Worklenz Services"

    cd "$INSTALL_DIR"

    print_step "Pulling Docker images..."
    $COMPOSE_CMD -f deploy/docker/compose/docker-compose.yml --env-file worklenz.env pull

    print_success "Images pulled"

    print_step "Building custom images..."
    $COMPOSE_CMD -f deploy/docker/compose/docker-compose.yml --env-file worklenz.env build

    print_success "Images built"

    print_step "Starting services..."
    $COMPOSE_CMD -f deploy/docker/compose/docker-compose.yml --env-file worklenz.env up -d

    print_success "Services started"
}

# ============================================
# Health Checks
# ============================================

wait_for_services() {
    print_header "Waiting for Services to be Ready"

    local max_wait=180
    local elapsed=0
    local interval=5

    cd "$INSTALL_DIR"

    print_info "This may take a few minutes..."
    echo ""

    while [ $elapsed -lt $max_wait ]; do
        local all_healthy=true

        # Check each service
        services=("postgres" "redis" "minio" "backend" "frontend" "nginx")

        for service in "${services[@]}"; do
            status=$($COMPOSE_CMD -f deploy/docker/compose/docker-compose.yml --env-file worklenz.env ps --filter "name=$service" --format "{{.Health}}" 2>/dev/null || echo "starting")

            if [ "$status" = "healthy" ] || [ "$status" = "" ]; then
                echo -ne "  ${service}: ${GREEN}✓${NC} "
            else
                echo -ne "  ${service}: ${YELLOW}⏳${NC} "
                all_healthy=false
            fi
        done

        echo "" # New line

        if [ "$all_healthy" = true ]; then
            print_success "All services are healthy!"
            return 0
        fi

        sleep $interval
        elapsed=$((elapsed + interval))

        # Move cursor up to overwrite status line
        if [ $elapsed -lt $max_wait ]; then
            echo -ne "\033[1A\033[2K"
        fi
    done

    print_warning "Some services may not be fully ready yet"
    print_info "You can check status with: docker compose ps"
    return 1
}

# ============================================
# Final Steps
# ============================================

show_success_message() {
    print_header "Installation Complete!"

    echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║                                                            ║${NC}"
    echo -e "${GREEN}${BOLD}║             🎉 WORKLENZ INSTALLED SUCCESSFULLY! 🎉         ║${NC}"
    echo -e "${GREEN}${BOLD}║                                                            ║${NC}"
    echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "${BOLD}Access Information:${NC}"
    echo -e "  ${CYAN}Frontend URL:${NC}  ${BOLD}${FRONTEND_URL}${NC}"
    echo -e "  ${CYAN}Admin Email:${NC}   ${ADMIN_EMAIL}"
    echo -e "  ${CYAN}Admin Password:${NC} ${ADMIN_PASSWORD}"
    echo ""

    echo -e "${BOLD}Installation Directory:${NC}"
    echo -e "  ${INSTALL_DIR}"
    echo ""

    echo -e "${BOLD}Useful Commands:${NC}"
    echo -e "  ${CYAN}View logs:${NC}      cd ${INSTALL_DIR} && docker compose -f deploy/docker/compose/docker-compose.yml logs -f"
    echo -e "  ${CYAN}Check status:${NC}   cd ${INSTALL_DIR} && docker compose -f deploy/docker/compose/docker-compose.yml ps"
    echo -e "  ${CYAN}Stop services:${NC}  cd ${INSTALL_DIR} && docker compose -f deploy/docker/compose/docker-compose.yml down"
    echo -e "  ${CYAN}Restart:${NC}        cd ${INSTALL_DIR} && docker compose -f deploy/docker/compose/docker-compose.yml restart"
    echo ""

    echo -e "${YELLOW}${BOLD}⚠ IMPORTANT:${NC}"
    echo -e "  ${YELLOW}1. Save your credentials from: ${CREDENTIALS_FILE}${NC}"
    echo -e "  ${YELLOW}2. Delete the credentials file after noting them down${NC}"
    echo -e "  ${YELLOW}3. If using SSL, ensure your domain points to this server${NC}"
    echo ""

    print_success "You can now access Worklenz at: ${BOLD}${FRONTEND_URL}${NC}"
    echo ""
}

# ============================================
# Error Handling
# ============================================

cleanup_on_error() {
    print_error "Installation failed!"
    print_info "Cleaning up..."

    if [ -d "$INSTALL_DIR" ] && [ -f "${INSTALL_DIR}/deploy/docker/compose/docker-compose.yml" ]; then
        cd "$INSTALL_DIR"
        $COMPOSE_CMD -f deploy/docker/compose/docker-compose.yml --env-file worklenz.env down 2>/dev/null || true
    fi

    print_info "You can retry the installation or check the logs for errors"
    exit 1
}

trap cleanup_on_error ERR

# ============================================
# Main Installation Flow
# ============================================

main() {
    # Banner
    print_banner

    # Detect OS
    detect_os
    check_root

    # System checks
    check_system_requirements

    # Docker checks
    check_docker
    if [ "$DOCKER_INSTALLED" = false ]; then
        if prompt_yn "Docker is not installed. Install Docker now?"; then
            install_docker
        else
            print_error "Docker is required. Please install Docker and run this script again."
            exit 1
        fi
    fi

    check_docker_compose
    if [ "$COMPOSE_INSTALLED" = false ]; then
        print_error "Docker Compose is required but not found."
        print_info "Please install Docker Compose v2 and run this script again."
        exit 1
    fi

    # Configuration wizard
    run_configuration_wizard

    # Download Worklenz
    download_worklenz

    # Generate configuration
    generate_config_file

    # Setup SSL if needed
    setup_ssl

    # Start services
    start_services

    # Wait for services
    wait_for_services

    # Success message
    show_success_message
}

# ============================================
# Run Main
# ============================================

main "$@"
