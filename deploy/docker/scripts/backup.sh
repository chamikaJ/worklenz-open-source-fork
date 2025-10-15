#!/bin/bash

# ============================================
# Worklenz Backup Script
# ============================================
# Create comprehensive backups of Worklenz data
#
# Usage:
#   ./backup.sh [--type TYPE] [--output DIR] [--encrypt]
#
# Options:
#   --type TYPE    Backup type: full, db, files, config (default: full)
#   --output DIR   Output directory (default: ./backups)
#   --encrypt      Encrypt backup with GPG
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/deploy/docker/compose/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/worklenz.env"

# Default values
BACKUP_TYPE="full"
BACKUP_DIR="${PROJECT_ROOT}/backups"
ENCRYPT_BACKUP=false
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --type)
            BACKUP_TYPE="$2"
            shift 2
            ;;
        --output)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --encrypt)
            ENCRYPT_BACKUP=true
            shift
            ;;
        --help)
            echo "Usage: $0 [--type TYPE] [--output DIR] [--encrypt]"
            echo ""
            echo "Options:"
            echo "  --type TYPE    Backup type: full, db, files, config (default: full)"
            echo "  --output DIR   Output directory (default: ./backups)"
            echo "  --encrypt      Encrypt backup with GPG"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

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
    echo -e "${BOLD}▶${NC} $1"
}

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    print_error "Configuration file not found: $ENV_FILE"
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
# Backup Functions
# ============================================

backup_database() {
    print_header "Database Backup"

    local backup_file="${BACKUP_DIR}/database_${TIMESTAMP}.sql"

    print_step "Creating PostgreSQL database dump..."

    docker exec worklenz_postgres pg_dump \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        --format=plain \
        > "$backup_file"

    # Compress
    print_step "Compressing database backup..."
    gzip "$backup_file"
    backup_file="${backup_file}.gz"

    print_success "Database backup created: $backup_file"

    local size=$(du -h "$backup_file" | cut -f1)
    print_info "Backup size: $size"

    echo "$backup_file"
}

backup_files() {
    print_header "Files Backup"

    if [ "$STORAGE_PROVIDER" = "minio" ] && [ "$MINIO_TYPE" = "embedded" ]; then
        local backup_file="${BACKUP_DIR}/files_${TIMESTAMP}.tar.gz"

        print_step "Backing up MinIO data volume..."

        # Export MinIO volume
        docker run --rm \
            -v worklenz_minio_data:/data \
            -v "${BACKUP_DIR}:/backup" \
            alpine \
            tar czf "/backup/files_${TIMESTAMP}.tar.gz" /data

        print_success "Files backup created: $backup_file"

        local size=$(du -h "$backup_file" | cut -f1)
        print_info "Backup size: $size"

        echo "$backup_file"
    else
        print_info "External storage ($STORAGE_PROVIDER) - Skipping file backup"
        print_info "Use your cloud provider's backup features for S3/Azure storage"
        echo ""
    fi
}

backup_config() {
    print_header "Configuration Backup"

    local backup_file="${BACKUP_DIR}/config_${TIMESTAMP}.tar.gz"

    print_step "Backing up configuration files..."

    cd "$PROJECT_ROOT"

    tar czf "$backup_file" \
        worklenz.env \
        deploy/docker/nginx/nginx.conf \
        deploy/docker/nginx/ssl/ \
        2>/dev/null || true

    print_success "Configuration backup created: $backup_file"

    local size=$(du -h "$backup_file" | cut -f1)
    print_info "Backup size: $size"

    echo "$backup_file"
}

backup_redis() {
    print_header "Redis Backup"

    if [ "$REDIS_TYPE" = "embedded" ]; then
        local backup_file="${BACKUP_DIR}/redis_${TIMESTAMP}.rdb"

        print_step "Creating Redis snapshot..."

        # Trigger BGSAVE
        docker exec worklenz_redis redis-cli -a "${REDIS_PASSWORD}" BGSAVE

        # Wait for save to complete
        sleep 2

        # Copy RDB file
        docker cp worklenz_redis:/data/dump.rdb "$backup_file"

        print_success "Redis backup created: $backup_file"

        local size=$(du -h "$backup_file" | cut -f1)
        print_info "Backup size: $size"

        echo "$backup_file"
    else
        print_info "External Redis - Skipping Redis backup"
        echo ""
    fi
}

encrypt_file() {
    local file=$1

    if [ "$ENCRYPT_BACKUP" = true ]; then
        print_step "Encrypting backup: $(basename $file)"

        if ! command -v gpg >/dev/null 2>&1; then
            print_warning "GPG not installed. Skipping encryption."
            return
        fi

        gpg --symmetric --cipher-algo AES256 "$file"
        rm "$file"

        print_success "Backup encrypted: ${file}.gpg"
        echo "${file}.gpg"
    else
        echo "$file"
    fi
}

create_backup_metadata() {
    local backup_files=("$@")
    local metadata_file="${BACKUP_DIR}/backup_${TIMESTAMP}.json"

    print_step "Creating backup metadata..."

    cat > "$metadata_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "type": "$BACKUP_TYPE",
  "version": "$WORKLENZ_VERSION",
  "domain": "$DOMAIN",
  "encrypted": $ENCRYPT_BACKUP,
  "files": [
$(for file in "${backup_files[@]}"; do
    if [ -n "$file" ]; then
        echo "    \"$(basename $file)\","
    fi
done | sed '$ s/,$//')
  ],
  "storage": {
    "provider": "$STORAGE_PROVIDER",
    "type": "$MINIO_TYPE"
  },
  "database": {
    "type": "$DATABASE_TYPE",
    "host": "$DB_HOST"
  }
}
EOF

    print_success "Metadata created: $metadata_file"
}

# ============================================
# Main Backup Logic
# ============================================

main() {
    print_header "Worklenz Backup - Type: $BACKUP_TYPE"

    # Create backup directory
    mkdir -p "$BACKUP_DIR"

    cd "$PROJECT_ROOT"

    # Array to store backup files
    declare -a backup_files

    case $BACKUP_TYPE in
        full)
            print_info "Creating full backup (database + files + config + redis)"
            echo ""

            db_backup=$(backup_database)
            backup_files+=("$db_backup")

            files_backup=$(backup_files)
            if [ -n "$files_backup" ]; then
                backup_files+=("$files_backup")
            fi

            config_backup=$(backup_config)
            backup_files+=("$config_backup")

            redis_backup=$(backup_redis)
            if [ -n "$redis_backup" ]; then
                backup_files+=("$redis_backup")
            fi
            ;;

        db)
            print_info "Creating database backup only"
            echo ""
            db_backup=$(backup_database)
            backup_files+=("$db_backup")
            ;;

        files)
            print_info "Creating files backup only"
            echo ""
            files_backup=$(backup_files)
            if [ -n "$files_backup" ]; then
                backup_files+=("$files_backup")
            fi
            ;;

        config)
            print_info "Creating configuration backup only"
            echo ""
            config_backup=$(backup_config)
            backup_files+=("$config_backup")
            ;;

        *)
            print_error "Invalid backup type: $BACKUP_TYPE"
            exit 1
            ;;
    esac

    # Encrypt backups if requested
    if [ "$ENCRYPT_BACKUP" = true ]; then
        print_header "Encrypting Backups"

        encrypted_files=()
        for file in "${backup_files[@]}"; do
            if [ -n "$file" ] && [ -f "$file" ]; then
                encrypted=$(encrypt_file "$file")
                encrypted_files+=("$encrypted")
            fi
        done

        backup_files=("${encrypted_files[@]}")
    fi

    # Create metadata
    create_backup_metadata "${backup_files[@]}"

    # Summary
    print_header "Backup Complete!"

    echo -e "${GREEN}${BOLD}Backup Summary:${NC}"
    echo -e "  Type: $BACKUP_TYPE"
    echo -e "  Timestamp: $TIMESTAMP"
    echo -e "  Location: $BACKUP_DIR"
    echo -e "  Encrypted: $ENCRYPT_BACKUP"
    echo ""

    echo -e "${BOLD}Backup Files:${NC}"
    for file in "${backup_files[@]}"; do
        if [ -n "$file" ] && [ -f "$file" ]; then
            local size=$(du -h "$file" | cut -f1)
            echo -e "  - $(basename $file) (${size})"
        fi
    done

    echo ""
    print_success "Backup completed successfully!"

    # Cleanup old backups (keep last 30 days)
    print_info "Cleaning up old backups (keeping last 30 days)..."
    find "$BACKUP_DIR" -name "*.gz" -o -name "*.gpg" -o -name "*.rdb" -mtime +30 -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "*.json" -mtime +30 -delete 2>/dev/null || true
}

# ============================================
# Run Main
# ============================================

main "$@"
