#!/bin/bash

# ============================================
# Worklenz Restore Script
# ============================================
# Restore Worklenz data from backups
#
# Usage:
#   ./restore.sh [backup_file]
#   ./restore.sh                    # Interactive mode
#   ./restore.sh backup_20240115.tar.gz
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
BACKUP_DIR="${PROJECT_ROOT}/backups"

# Backup file to restore
BACKUP_FILE="$1"

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
# Backup Selection
# ============================================

list_backups() {
    print_header "Available Backups"

    if [ ! -d "$BACKUP_DIR" ]; then
        print_warning "No backup directory found: $BACKUP_DIR"
        return 1
    fi

    # Find all backup metadata files
    local backups=($(find "$BACKUP_DIR" -name "backup_*.json" -type f | sort -r))

    if [ ${#backups[@]} -eq 0 ]; then
        print_warning "No backups found in $BACKUP_DIR"
        return 1
    fi

    echo -e "${BOLD}Index  Date/Time           Type      Version    Encrypted${NC}"
    echo "─────────────────────────────────────────────────────────────"

    local index=1
    for backup_meta in "${backups[@]}"; do
        local timestamp=$(basename "$backup_meta" .json | sed 's/backup_//')
        local type=$(grep -oP '"type":\s*"\K[^"]+' "$backup_meta" 2>/dev/null || echo "unknown")
        local version=$(grep -oP '"version":\s*"\K[^"]+' "$backup_meta" 2>/dev/null || echo "unknown")
        local encrypted=$(grep -oP '"encrypted":\s*\K[^,}]+' "$backup_meta" 2>/dev/null || echo "false")

        # Format timestamp for display
        local display_time=$(echo "$timestamp" | sed 's/_/ /')

        printf "%-6s %-19s %-9s %-10s %s\n" \
            "$index)" \
            "$display_time" \
            "$type" \
            "$version" \
            "$encrypted"

        # Store backup path for selection
        eval "BACKUP_OPTION_${index}='${BACKUP_DIR}/${timestamp}'"

        index=$((index + 1))
    done

    echo ""
    BACKUP_COUNT=$((index - 1))
    return 0
}

select_backup() {
    if ! list_backups; then
        exit 1
    fi

    echo -e "${CYAN}Select a backup to restore [1-${BACKUP_COUNT}]:${NC} "
    read selection

    if [ -z "$selection" ] || [ "$selection" -lt 1 ] || [ "$selection" -gt "$BACKUP_COUNT" ]; then
        print_error "Invalid selection"
        exit 1
    fi

    eval "SELECTED_BACKUP=\$BACKUP_OPTION_${selection}"

    # Find backup files
    DATABASE_BACKUP="${SELECTED_BACKUP}/database_*.sql.gz"
    FILES_BACKUP="${SELECTED_BACKUP}/files_*.tar.gz"
    CONFIG_BACKUP="${SELECTED_BACKUP}/config_*.tar.gz"
    REDIS_BACKUP="${SELECTED_BACKUP}/redis_*.rdb"

    # Check for actual files
    DATABASE_BACKUP=$(ls $DATABASE_BACKUP 2>/dev/null | head -1)
    FILES_BACKUP=$(ls $FILES_BACKUP 2>/dev/null | head -1)
    CONFIG_BACKUP=$(ls $CONFIG_BACKUP 2>/dev/null | head -1)
    REDIS_BACKUP=$(ls $REDIS_BACKUP 2>/dev/null | head -1)

    print_info "Selected backup from: $(basename $SELECTED_BACKUP)"
}

# ============================================
# Restore Functions
# ============================================

restore_database() {
    print_header "Database Restoration"

    if [ -z "$DATABASE_BACKUP" ] || [ ! -f "$DATABASE_BACKUP" ]; then
        print_warning "Database backup not found, skipping"
        return
    fi

    print_warning "This will OVERWRITE the current database!"
    if ! prompt_yn "Continue with database restoration?"; then
        print_info "Skipping database restoration"
        return
    fi

    print_step "Stopping backend services..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop backend worker

    print_step "Dropping existing database..."
    docker exec worklenz_postgres psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"

    print_step "Creating fresh database..."
    docker exec worklenz_postgres psql -U "$DB_USER" -d postgres -c "CREATE DATABASE ${DB_NAME};"

    print_step "Restoring database from backup..."
    gunzip -c "$DATABASE_BACKUP" | docker exec -i worklenz_postgres psql -U "$DB_USER" -d "$DB_NAME"

    print_success "Database restored successfully"

    print_step "Restarting backend services..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" start backend worker

    sleep 3
    print_success "Backend services restarted"
}

restore_files() {
    print_header "Files Restoration"

    if [ "$STORAGE_PROVIDER" != "minio" ] || [ "$MINIO_TYPE" != "embedded" ]; then
        print_info "External storage in use, skipping file restoration"
        return
    fi

    if [ -z "$FILES_BACKUP" ] || [ ! -f "$FILES_BACKUP" ]; then
        print_warning "Files backup not found, skipping"
        return
    fi

    print_warning "This will OVERWRITE all uploaded files!"
    if ! prompt_yn "Continue with files restoration?"; then
        print_info "Skipping files restoration"
        return
    fi

    print_step "Stopping MinIO..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop minio

    print_step "Clearing existing MinIO data..."
    docker run --rm \
        -v worklenz_minio_data:/data \
        alpine \
        sh -c "rm -rf /data/*"

    print_step "Restoring files from backup..."
    docker run --rm \
        -v worklenz_minio_data:/data \
        -v "$BACKUP_DIR:/backup" \
        alpine \
        tar xzf "/backup/$(basename $FILES_BACKUP)" -C /

    print_success "Files restored successfully"

    print_step "Restarting MinIO..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" start minio

    sleep 3
    print_success "MinIO restarted"
}

restore_configuration() {
    print_header "Configuration Restoration"

    if [ -z "$CONFIG_BACKUP" ] || [ ! -f "$CONFIG_BACKUP" ]; then
        print_warning "Configuration backup not found, skipping"
        return
    fi

    print_warning "This will OVERWRITE current configuration files!"
    if ! prompt_yn "Continue with configuration restoration?"; then
        print_info "Skipping configuration restoration"
        return
    fi

    print_step "Extracting configuration backup..."

    # Extract to temp directory first
    local temp_dir=$(mktemp -d)
    tar xzf "$CONFIG_BACKUP" -C "$temp_dir"

    # Restore specific files
    if [ -f "${temp_dir}/worklenz.env" ]; then
        print_step "Restoring worklenz.env..."
        cp "${temp_dir}/worklenz.env" "$PROJECT_ROOT/worklenz.env"
        print_success "Environment configuration restored"
    fi

    if [ -f "${temp_dir}/deploy/docker/nginx/nginx.conf" ]; then
        print_step "Restoring nginx.conf..."
        cp "${temp_dir}/deploy/docker/nginx/nginx.conf" "${PROJECT_ROOT}/deploy/docker/nginx/nginx.conf"
        print_success "Nginx configuration restored"
    fi

    if [ -d "${temp_dir}/deploy/docker/nginx/ssl" ]; then
        print_step "Restoring SSL certificates..."
        cp -r "${temp_dir}/deploy/docker/nginx/ssl/"* "${PROJECT_ROOT}/deploy/docker/nginx/ssl/" 2>/dev/null || true
        print_success "SSL certificates restored"
    fi

    rm -rf "$temp_dir"

    print_warning "Configuration restored. Services will be restarted."
}

restore_redis() {
    print_header "Redis Restoration"

    if [ "$REDIS_TYPE" != "embedded" ]; then
        print_info "External Redis in use, skipping restoration"
        return
    fi

    if [ -z "$REDIS_BACKUP" ] || [ ! -f "$REDIS_BACKUP" ]; then
        print_warning "Redis backup not found, skipping"
        return
    fi

    if ! prompt_yn "Restore Redis cache data?"; then
        print_info "Skipping Redis restoration"
        return
    fi

    print_step "Stopping Redis..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop redis

    print_step "Restoring Redis snapshot..."
    docker cp "$REDIS_BACKUP" worklenz_redis:/data/dump.rdb

    print_step "Restarting Redis..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" start redis

    sleep 2
    print_success "Redis restored successfully"
}

# ============================================
# Verification
# ============================================

verify_restoration() {
    print_header "Verifying Restoration"

    print_step "Checking service health..."

    sleep 5

    # Check database
    if docker exec worklenz_postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        print_success "Database is accessible"
    else
        print_error "Database connection failed"
        return 1
    fi

    # Check backend
    local backend_status=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps backend --format "{{.State}}")
    if [ "$backend_status" = "running" ]; then
        print_success "Backend is running"
    else
        print_error "Backend is not running"
        return 1
    fi

    # Check frontend
    local frontend_status=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps frontend --format "{{.State}}")
    if [ "$frontend_status" = "running" ]; then
        print_success "Frontend is running"
    else
        print_error "Frontend is not running"
        return 1
    fi

    print_success "All checks passed!"
}

# ============================================
# Main Restore Flow
# ============================================

main() {
    echo -e "${CYAN}${BOLD}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                                                            ║"
    echo "║                  WORKLENZ RESTORE                          ║"
    echo "║                                                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    print_warning "IMPORTANT: Restoration will overwrite existing data!"
    print_warning "Make sure you have a recent backup of current data before proceeding."
    echo ""

    if ! prompt_yn "Do you want to continue?"; then
        print_info "Restoration cancelled"
        exit 0
    fi

    # Select backup if not provided
    if [ -z "$BACKUP_FILE" ]; then
        select_backup
    else
        # Use provided backup file
        if [ ! -f "$BACKUP_FILE" ]; then
            print_error "Backup file not found: $BACKUP_FILE"
            exit 1
        fi

        print_info "Using backup file: $BACKUP_FILE"
        # TODO: Extract backup file if it's a tar.gz
    fi

    # Display what will be restored
    print_header "Restoration Plan"

    [ -n "$DATABASE_BACKUP" ] && echo -e "  ${GREEN}✓${NC} Database backup found"
    [ -n "$FILES_BACKUP" ] && echo -e "  ${GREEN}✓${NC} Files backup found"
    [ -n "$CONFIG_BACKUP" ] && echo -e "  ${GREEN}✓${NC} Configuration backup found"
    [ -n "$REDIS_BACKUP" ] && echo -e "  ${GREEN}✓${NC} Redis backup found"

    echo ""

    # Confirm before proceeding
    if ! prompt_yn "Proceed with restoration?"; then
        print_info "Restoration cancelled"
        exit 0
    fi

    # Perform restoration
    cd "$PROJECT_ROOT"

    restore_database
    restore_files
    restore_configuration
    restore_redis

    # Restart all services
    print_header "Restarting All Services"

    print_step "Restarting all services..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart

    # Verify
    verify_restoration

    # Success message
    print_header "Restoration Complete!"

    echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║                                                            ║${NC}"
    echo -e "${GREEN}${BOLD}║         ✓ RESTORATION COMPLETED SUCCESSFULLY!              ║${NC}"
    echo -e "${GREEN}${BOLD}║                                                            ║${NC}"
    echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "  ${BOLD}Frontend URL:${NC}  ${FRONTEND_URL}"
    echo ""

    print_info "You can check service status with: ./status.sh"
    print_info "View logs with: ./logs.sh"

    echo ""
    print_success "Restoration complete!"
}

# ============================================
# Run Main
# ============================================

main "$@"
