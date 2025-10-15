#!/bin/bash

# ============================================
# Worklenz Environment Setup Script
# ============================================
# This script generates a production-ready worklenz.env file
# with secure random secrets and configurable options
#
# Usage:
#   ./setup-env.sh [domain] [use_ssl]
#
# Examples:
#   ./setup-env.sh localhost false
#   ./setup-env.sh worklenz.example.com true
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CONFIG_DIR="${SCRIPT_DIR}/../config"
TEMPLATE_FILE="${CONFIG_DIR}/worklenz.env.template"
OUTPUT_FILE="${PROJECT_ROOT}/worklenz.env"

# ============================================
# Helper Functions
# ============================================

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
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

# Prompt for input with default value
prompt() {
    local prompt_text="$1"
    local default_value="$2"
    local user_input

    if [ -n "$default_value" ]; then
        read -p "$prompt_text [$default_value]: " user_input
        echo "${user_input:-$default_value}"
    else
        read -p "$prompt_text: " user_input
        echo "$user_input"
    fi
}

# Prompt for yes/no
prompt_yn() {
    local prompt_text="$1"
    local default_value="${2:-Y}"
    local user_input

    while true; do
        read -p "$prompt_text [Y/n]: " user_input
        user_input="${user_input:-$default_value}"

        case "$user_input" in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Please answer Y or n.";;
        esac
    done
}

# ============================================
# Main Setup
# ============================================

print_header "Worklenz Environment Configuration Generator"

# Check if template exists
if [ ! -f "$TEMPLATE_FILE" ]; then
    print_error "Template file not found: $TEMPLATE_FILE"
    exit 1
fi

# Check if output file exists
if [ -f "$OUTPUT_FILE" ]; then
    print_warning "Configuration file already exists: $OUTPUT_FILE"
    if ! prompt_yn "Do you want to overwrite it?"; then
        print_info "Setup cancelled."
        exit 0
    fi
    print_warning "Backing up existing configuration..."
    cp "$OUTPUT_FILE" "${OUTPUT_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    print_success "Backup created"
fi

# Copy template to output
cp "$TEMPLATE_FILE" "$OUTPUT_FILE"

# ============================================
# Generate Secrets
# ============================================

print_header "Generating Secure Secrets"

SESSION_SECRET=$(generate_secret 64)
COOKIE_SECRET=$(generate_secret 64)
JWT_SECRET=$(generate_secret 64)
CSRF_SECRET=$(generate_secret 64)
DB_PASSWORD=$(generate_password 32)
REDIS_PASSWORD=$(generate_password 32)
MINIO_PASSWORD=$(generate_password 32)
ADMIN_PASSWORD=$(generate_password 16)

print_success "Session secret generated"
print_success "Cookie secret generated"
print_success "JWT secret generated"
print_success "CSRF secret generated"
print_success "Database password generated"
print_success "Redis password generated"
print_success "MinIO password generated"
print_success "Admin password generated"

# ============================================
# Domain Configuration
# ============================================

print_header "Domain & Network Configuration"

DOMAIN="${1:-$(prompt 'Enter your domain' 'localhost')}"
USE_SSL="${2:-$(prompt_yn 'Enable SSL/HTTPS?' && echo 'true' || echo 'false')}"

if [ "$USE_SSL" = "true" ]; then
    FRONTEND_URL="https://${DOMAIN}"
    BACKEND_URL="https://${DOMAIN}/api"
    SOCKET_URL="wss://${DOMAIN}"
    SESSION_COOKIE_SECURE="true"
else
    FRONTEND_URL="http://${DOMAIN}"
    BACKEND_URL="http://${DOMAIN}/api"
    SOCKET_URL="ws://${DOMAIN}"
    SESSION_COOKIE_SECURE="false"
fi

print_info "Domain: $DOMAIN"
print_info "SSL Enabled: $USE_SSL"
print_info "Frontend URL: $FRONTEND_URL"

# ============================================
# Installation Mode
# ============================================

print_header "Installation Mode"

echo "Select installation mode:"
echo "  1) Express    - All services embedded, quick setup (recommended)"
echo "  2) Standard   - Choose embedded or external services"
echo "  3) Enterprise - External services, high availability"
echo ""

MODE_CHOICE=$(prompt 'Select mode' '1')

case $MODE_CHOICE in
    1)
        INSTALLATION_MODE="express"
        DATABASE_TYPE="embedded"
        REDIS_TYPE="embedded"
        MINIO_TYPE="embedded"
        STORAGE_PROVIDER="minio"
        ;;
    2)
        INSTALLATION_MODE="standard"
        # Will prompt for each service
        ;;
    3)
        INSTALLATION_MODE="enterprise"
        DATABASE_TYPE="external"
        REDIS_TYPE="external"
        MINIO_TYPE="external"
        STORAGE_PROVIDER="s3"
        ;;
esac

print_success "Installation mode: $INSTALLATION_MODE"

# ============================================
# Email Configuration
# ============================================

print_header "Email Configuration (Optional)"

if prompt_yn "Configure email settings now?"; then
    ADMIN_EMAIL=$(prompt 'Admin email address' 'admin@example.com')
    CONTACT_EMAIL=$(prompt 'Support email address' 'support@example.com')

    if prompt_yn "Enable SMTP for sending emails?"; then
        SMTP_HOST=$(prompt 'SMTP host' 'smtp.gmail.com')
        SMTP_PORT=$(prompt 'SMTP port' '587')
        SMTP_USER=$(prompt 'SMTP username' '')
        SMTP_PASSWORD=$(prompt 'SMTP password' '')
        SMTP_FROM_EMAIL=$(prompt 'From email address' "$CONTACT_EMAIL")
        EMAIL_ENABLED="true"
    else
        EMAIL_ENABLED="false"
    fi
else
    ADMIN_EMAIL="admin@example.com"
    CONTACT_EMAIL="support@example.com"
    EMAIL_ENABLED="false"
fi

# ============================================
# Apply Configuration
# ============================================

print_header "Applying Configuration"

# Replace secrets
sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|g" "$OUTPUT_FILE"
sed -i "s|COOKIE_SECRET=.*|COOKIE_SECRET=${COOKIE_SECRET}|g" "$OUTPUT_FILE"
sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|g" "$OUTPUT_FILE"
sed -i "s|CSRF_SECRET=.*|CSRF_SECRET=${CSRF_SECRET}|g" "$OUTPUT_FILE"
sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD}|g" "$OUTPUT_FILE"
sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PASSWORD}|g" "$OUTPUT_FILE"
sed -i "s|MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}|g" "$OUTPUT_FILE"
sed -i "s|S3_SECRET_ACCESS_KEY=.*|S3_SECRET_ACCESS_KEY=${MINIO_PASSWORD}|g" "$OUTPUT_FILE"
sed -i "s|ADMIN_INITIAL_PASSWORD=.*|ADMIN_INITIAL_PASSWORD=${ADMIN_PASSWORD}|g" "$OUTPUT_FILE"

# Replace domain configuration
sed -i "s|DOMAIN=.*|DOMAIN=${DOMAIN}|g" "$OUTPUT_FILE"
sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=${FRONTEND_URL}|g" "$OUTPUT_FILE"
sed -i "s|BACKEND_URL=.*|BACKEND_URL=${BACKEND_URL}|g" "$OUTPUT_FILE"
sed -i "s|SOCKET_URL=.*|SOCKET_URL=${SOCKET_URL}|g" "$OUTPUT_FILE"
sed -i "s|USE_SSL=.*|USE_SSL=${USE_SSL}|g" "$OUTPUT_FILE"
sed -i "s|SESSION_COOKIE_SECURE=.*|SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE}|g" "$OUTPUT_FILE"
sed -i "s|INSTALLATION_MODE=.*|INSTALLATION_MODE=${INSTALLATION_MODE}|g" "$OUTPUT_FILE"

# Email configuration
if [ -n "$ADMIN_EMAIL" ]; then
    sed -i "s|ADMIN_EMAIL=.*|ADMIN_EMAIL=${ADMIN_EMAIL}|g" "$OUTPUT_FILE"
    sed -i "s|CONTACT_US_EMAIL=.*|CONTACT_US_EMAIL=${CONTACT_EMAIL}|g" "$OUTPUT_FILE"
fi

if [ "$EMAIL_ENABLED" = "true" ]; then
    sed -i "s|EMAIL_ENABLED=.*|EMAIL_ENABLED=true|g" "$OUTPUT_FILE"
    sed -i "s|SMTP_HOST=.*|SMTP_HOST=${SMTP_HOST}|g" "$OUTPUT_FILE"
    sed -i "s|SMTP_PORT=.*|SMTP_PORT=${SMTP_PORT}|g" "$OUTPUT_FILE"
    sed -i "s|SMTP_USER=.*|SMTP_USER=${SMTP_USER}|g" "$OUTPUT_FILE"
    sed -i "s|SMTP_PASSWORD=.*|SMTP_PASSWORD=${SMTP_PASSWORD}|g" "$OUTPUT_FILE"
    sed -i "s|SMTP_FROM_EMAIL=.*|SMTP_FROM_EMAIL=${SMTP_FROM_EMAIL}|g" "$OUTPUT_FILE"
fi

print_success "Configuration file created: $OUTPUT_FILE"

# ============================================
# Summary
# ============================================

print_header "Configuration Summary"

echo "Installation Mode: $INSTALLATION_MODE"
echo "Domain: $DOMAIN"
echo "Frontend URL: $FRONTEND_URL"
echo "Backend URL: $BACKEND_URL"
echo "SSL Enabled: $USE_SSL"
echo "Email Enabled: $EMAIL_ENABLED"
echo ""
echo "Generated Credentials:"
echo "  Database Password: $DB_PASSWORD"
echo "  Redis Password: $REDIS_PASSWORD"
echo "  MinIO Password: $MINIO_PASSWORD"
echo "  Admin Password: $ADMIN_PASSWORD"
echo ""

print_warning "IMPORTANT: Save these credentials securely!"
print_warning "The admin password is needed for first login."

# Save credentials to separate file
CREDENTIALS_FILE="${PROJECT_ROOT}/.worklenz-credentials-$(date +%Y%m%d_%H%M%S).txt"
cat > "$CREDENTIALS_FILE" << EOF
Worklenz Installation Credentials
Generated: $(date)
================================

Domain: $DOMAIN
Frontend URL: $FRONTEND_URL
Admin Email: $ADMIN_EMAIL
Admin Password: $ADMIN_PASSWORD

Database Password: $DB_PASSWORD
Redis Password: $REDIS_PASSWORD
MinIO Password: $MINIO_PASSWORD

Session Secret: $SESSION_SECRET
JWT Secret: $JWT_SECRET

IMPORTANT: Store this file securely and delete it after noting down the credentials!
EOF

print_success "Credentials saved to: $CREDENTIALS_FILE"

print_header "Next Steps"

echo "1. Review the configuration file: worklenz.env"
echo "2. Start Worklenz: docker-compose -f deploy/docker/compose/docker-compose.yml up -d"
echo "3. Access Worklenz at: $FRONTEND_URL"
echo "4. Login with:"
echo "   Email: $ADMIN_EMAIL"
echo "   Password: $ADMIN_PASSWORD"
echo ""
print_success "Setup complete!"
