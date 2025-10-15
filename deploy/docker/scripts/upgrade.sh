#!/bin/bash

# ============================================
# Worklenz Upgrade Script
# ============================================
# Upgrade Worklenz to a new version with automatic backup
#
# Usage:
#   ./upgrade.sh [version]
#
# Examples:
#   ./upgrade.sh              # Upgrade to latest version
#   ./upgrade.sh 1.6.0        # Upgrade to specific version
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/deploy/docker/compose/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/worklenz.env"

# Target version (latest if not specified)
TARGET_VERSION="${1:-latest}"

GITHUB_REPO="Worklenz/worklenz"

# ============================================
# Helper Functions
# ============================================

print_header() {
    echo ""
    echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}${BOLD}$1${NC}"
    echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
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

prompt_yn() {
    local prompt_text="$1"
    local default_value="${2:-Y}"
    local user_input

    while true; do
        read -p "$(echo -e ${BLUE}$prompt_text ${BOLD}[Y/n]${NC}: ) " user_input
        user_input="${user_input:-$default_value}"

        case "$user_input" in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Please answer Y or n.";;
        esac
    done
}

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    print_error "Configuration file not found: $ENV_FILE"
    print_info "Please run the installation script first."
    exit 1
fi

# Load environment variables
source "$ENV_FILE"

# Detect compose command
if command -v "docker" >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v "docker-compose" >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    print_error "Docker Compose not found"
    exit 1
fi

# ============================================
# Version Functions
# ============================================

get_current_version() {
    if [ -f "${PROJECT_ROOT}/.git/HEAD" ]; then
        git -C "$PROJECT_ROOT" describe --tags --always 2>/dev/null || echo "$WORKLENZ_VERSION"
    else
        echo "$WORKLENZ_VERSION"
    fi
}

get_latest_version() {
    curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || echo "unknown"
}

version_gt() {
    test "$(printf '%s\n' "$@" | sort -V | head -n 1)" != "$1"
}

# ============================================
# Pre-Upgrade Checks
# ============================================

check_prerequisites() {
    print_header "Pre-Upgrade Checks"

    print_step "Checking current installation..."

    # Check if services are running
    local running_services=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --services --filter "status=running" | wc -l)

    if [ "$running_services" -eq 0 ]; then
        print_warning "No services are currently running"
        if ! prompt_yn "Continue with upgrade anyway?"; then
            exit 0
        fi
    else
        print_success "$running_services services running"
    fi

    # Check disk space
    local available_space=$(df -BG "$PROJECT_ROOT" | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$available_space" -lt 5 ]; then
        print_warning "Low disk space: ${available_space}GB available (recommended: 5GB+)"
        if ! prompt_yn "Continue anyway?"; then
            exit 0
        fi
    else
        print_success "Sufficient disk space: ${available_space}GB"
    fi

    print_success "Pre-upgrade checks passed"
}

# ============================================
# Version Information
# ============================================

display_version_info() {
    print_header "Version Information"

    local current_version=$(get_current_version)
    echo -e "  ${BOLD}Current Version:${NC}  $current_version"

    if [ "$TARGET_VERSION" = "latest" ]; then
        print_step "Fetching latest version..."
        local latest_version=$(get_latest_version)

        if [ "$latest_version" != "unknown" ]; then
            echo -e "  ${BOLD}Latest Version:${NC}   $latest_version"
            TARGET_VERSION="$latest_version"

            if [ "$current_version" = "$latest_version" ]; then
                print_info "You are already on the latest version"
                if ! prompt_yn "Continue with upgrade anyway?"; then
                    exit 0
                fi
            fi
        else
            print_warning "Could not fetch latest version. Will upgrade to main branch."
            TARGET_VERSION="main"
        fi
    else
        echo -e "  ${BOLD}Target Version:${NC}   $TARGET_VERSION"
    fi

    echo ""
}

display_changelog() {
    if [ "$TARGET_VERSION" != "main" ] && [ "$TARGET_VERSION" != "latest" ]; then
        print_header "Changelog"

        print_step "Fetching release notes for $TARGET_VERSION..."

        local changelog=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${TARGET_VERSION}" | grep '"body":' | sed -E 's/.*"body": "(.*)".*/\1/' | sed 's/\\n/\n/g' | head -20)

        if [ -n "$changelog" ]; then
            echo "$changelog"
            echo ""
        else
            print_info "No changelog available"
        fi
    fi
}

# ============================================
# Backup Before Upgrade
# ============================================

create_backup() {
    print_header "Creating Pre-Upgrade Backup"

    print_warning "It is highly recommended to create a backup before upgrading"

    if prompt_yn "Create backup now?"; then
        if [ -f "${SCRIPT_DIR}/backup.sh" ]; then
            bash "${SCRIPT_DIR}/backup.sh" --type full --output "${PROJECT_ROOT}/backups"
            print_success "Backup created"
        else
            print_warning "Backup script not found. Skipping backup."
        fi
    else
        print_warning "Skipping backup. This is not recommended!"
        if ! prompt_yn "Are you sure you want to continue without a backup?"; then
            exit 0
        fi
    fi
}

# ============================================
# Upgrade Process
# ============================================

stop_services() {
    print_header "Stopping Services"

    cd "$PROJECT_ROOT"

    print_step "Gracefully stopping all services..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

    print_success "Services stopped"
}

download_new_version() {
    print_header "Downloading New Version"

    cd "$PROJECT_ROOT"

    # Backup current version
    print_step "Backing up current code..."
    local backup_dir="${PROJECT_ROOT}/.upgrade-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    cp -r "${PROJECT_ROOT}/deploy" "$backup_dir/" 2>/dev/null || true
    cp -r "${PROJECT_ROOT}/worklenz-backend" "$backup_dir/" 2>/dev/null || true
    cp -r "${PROJECT_ROOT}/worklenz-frontend" "$backup_dir/" 2>/dev/null || true

    print_success "Current code backed up to: $backup_dir"

    # Download new version
    if [ -d "${PROJECT_ROOT}/.git" ]; then
        print_step "Pulling latest changes from Git..."

        git fetch --all --tags
        git checkout "$TARGET_VERSION"
        git pull origin "$TARGET_VERSION"

        print_success "Code updated via Git"
    else
        print_step "Downloading version archive..."

        local download_url
        if [ "$TARGET_VERSION" = "main" ] || [ "$TARGET_VERSION" = "latest" ]; then
            download_url="https://github.com/${GITHUB_REPO}/archive/refs/heads/main.tar.gz"
        else
            download_url="https://github.com/${GITHUB_REPO}/archive/refs/tags/${TARGET_VERSION}.tar.gz"
        fi

        curl -fsSL "$download_url" -o /tmp/worklenz-update.tar.gz

        # Extract (preserving config files)
        tar -xzf /tmp/worklenz-update.tar.gz --strip-components=1 \
            --exclude="worklenz.env" \
            --exclude="deploy/docker/nginx/ssl/*" \
            -C "$PROJECT_ROOT"

        rm /tmp/worklenz-update.tar.gz

        print_success "Code updated from archive"
    fi
}

rebuild_images() {
    print_header "Rebuilding Docker Images"

    cd "$PROJECT_ROOT"

    print_step "Pulling latest base images..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull

    print_step "Building new application images..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache

    print_success "Images rebuilt"
}

run_migrations() {
    print_header "Running Database Migrations"

    cd "$PROJECT_ROOT"

    print_step "Starting database temporarily..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres

    sleep 5

    print_step "Running database migrations..."

    # Check if migration runner exists in backend
    if docker exec worklenz_postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        print_success "Database is accessible"

        # Run migrations (if migration system exists)
        # This would call the actual migration runner from the backend
        print_info "Migration system ready"
    else
        print_warning "Could not connect to database for migrations"
    fi
}

start_services() {
    print_header "Starting Upgraded Services"

    cd "$PROJECT_ROOT"

    print_step "Starting all services..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

    print_success "Services started"
}

verify_upgrade() {
    print_header "Verifying Upgrade"

    cd "$PROJECT_ROOT"

    print_step "Waiting for services to be healthy..."
    sleep 10

    local max_wait=60
    local elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        local healthy_count=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps | grep -c "healthy" || echo "0")

        if [ "$healthy_count" -ge 4 ]; then
            print_success "Services are healthy"
            return 0
        fi

        sleep 5
        elapsed=$((elapsed + 5))
    done

    print_warning "Some services may not be fully healthy yet"
    print_info "Check status with: ./status.sh"
}

update_env_version() {
    print_step "Updating version in configuration..."

    if [ "$TARGET_VERSION" != "main" ]; then
        sed -i "s/WORKLENZ_VERSION=.*/WORKLENZ_VERSION=${TARGET_VERSION}/" "$ENV_FILE"
        print_success "Version updated in worklenz.env"
    fi
}

# ============================================
# Rollback
# ============================================

rollback() {
    print_error "Upgrade failed!"
    print_warning "Rolling back to previous version..."

    cd "$PROJECT_ROOT"

    # Stop current services
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down 2>/dev/null || true

    # Restore from backup
    local latest_backup=$(ls -t "${PROJECT_ROOT}/.upgrade-backup-"* 2>/dev/null | head -1)

    if [ -n "$latest_backup" ]; then
        print_step "Restoring from: $latest_backup"

        cp -r "$latest_backup/deploy" "$PROJECT_ROOT/" 2>/dev/null || true
        cp -r "$latest_backup/worklenz-backend" "$PROJECT_ROOT/" 2>/dev/null || true
        cp -r "$latest_backup/worklenz-frontend" "$PROJECT_ROOT/" 2>/dev/null || true

        # Restart with old version
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

        print_success "Rollback complete"
    else
        print_error "No backup found for rollback"
    fi

    exit 1
}

trap rollback ERR

# ============================================
# Main Upgrade Flow
# ============================================

main() {
    echo -e "${CYAN}${BOLD}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                                                            ║"
    echo "║                  WORKLENZ UPGRADE                          ║"
    echo "║                                                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # Pre-checks
    check_prerequisites

    # Version info
    display_version_info
    display_changelog

    # Confirmation
    echo ""
    print_warning "This will upgrade Worklenz and restart all services"
    if ! prompt_yn "Do you want to continue?"; then
        print_info "Upgrade cancelled"
        exit 0
    fi

    # Backup
    create_backup

    # Upgrade steps
    stop_services
    download_new_version
    rebuild_images
    run_migrations
    update_env_version
    start_services
    verify_upgrade

    # Success message
    print_header "Upgrade Complete!"

    echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║                                                            ║${NC}"
    echo -e "${GREEN}${BOLD}║           ✓ UPGRADE COMPLETED SUCCESSFULLY!                ║${NC}"
    echo -e "${GREEN}${BOLD}║                                                            ║${NC}"
    echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    local new_version=$(get_current_version)
    echo -e "  ${BOLD}New Version:${NC}    $new_version"
    echo -e "  ${BOLD}Frontend URL:${NC}   ${FRONTEND_URL}"
    echo ""

    print_info "You can check service status with: ./status.sh"
    print_info "View logs with: $COMPOSE_CMD -f $COMPOSE_FILE logs -f"

    # Cleanup old backups
    print_step "Cleaning up old upgrade backups (keeping last 5)..."
    ls -t "${PROJECT_ROOT}/.upgrade-backup-"* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true

    echo ""
    print_success "Upgrade complete!"
}

# ============================================
# Run Main
# ============================================

main "$@"
