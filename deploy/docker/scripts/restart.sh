#!/bin/bash

# ============================================
# Worklenz Restart Script
# ============================================
# Gracefully restart Worklenz services
#
# Usage:
#   ./restart.sh [service]          # Restart specific service
#   ./restart.sh                    # Restart all services
#   ./restart.sh --hard             # Hard restart (down + up)
#
# Examples:
#   ./restart.sh                    # Restart all
#   ./restart.sh backend            # Restart backend only
#   ./restart.sh backend frontend   # Restart multiple services
#   ./restart.sh --hard             # Full restart
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

# Options
HARD_RESTART=false
SERVICES=()

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --hard)
            HARD_RESTART=true
            shift
            ;;
        --help)
            echo "Usage: $0 [service...] [--hard]"
            echo ""
            echo "Restart Worklenz services gracefully"
            echo ""
            echo "Services:"
            echo "  nginx      - Nginx reverse proxy"
            echo "  frontend   - React frontend"
            echo "  backend    - Express API server"
            echo "  worker     - Background worker"
            echo "  postgres   - PostgreSQL database"
            echo "  redis      - Redis cache"
            echo "  minio      - MinIO storage (if embedded)"
            echo ""
            echo "Options:"
            echo "  --hard     Perform hard restart (down + up)"
            echo ""
            echo "Examples:"
            echo "  $0                        # Restart all services"
            echo "  $0 backend                # Restart backend only"
            echo "  $0 backend frontend       # Restart multiple"
            echo "  $0 --hard                 # Hard restart all"
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
        *)
            SERVICES+=("$1")
            shift
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
# Validation
# ============================================

validate_services() {
    local valid_services=("nginx" "frontend" "backend" "worker" "postgres" "redis" "minio")

    for service in "${SERVICES[@]}"; do
        local found=false
        for valid in "${valid_services[@]}"; do
            if [ "$service" = "$valid" ]; then
                found=true
                break
            fi
        done

        if [ "$found" = false ]; then
            print_error "Unknown service: $service"
            echo "Valid services: ${valid_services[*]}"
            exit 1
        fi
    done
}

# ============================================
# Restart Functions
# ============================================

graceful_restart() {
    local services_list="$1"

    print_step "Performing graceful restart..."

    if [ -z "$services_list" ]; then
        print_info "Restarting all services"
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart
    else
        print_info "Restarting: $services_list"
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart $services_list
    fi

    print_success "Services restarted"
}

hard_restart() {
    local services_list="$1"

    print_warning "Performing hard restart (services will be stopped and recreated)"

    print_step "Stopping services..."
    if [ -z "$services_list" ]; then
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
    else
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop $services_list
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" rm -f $services_list
    fi

    print_success "Services stopped"

    print_step "Starting services..."
    if [ -z "$services_list" ]; then
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    else
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d $services_list
    fi

    print_success "Services started"
}

wait_for_health() {
    local services_list="$1"

    print_step "Waiting for services to be healthy..."

    local max_wait=60
    local elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        local all_healthy=true

        # If specific services, check only those
        if [ -n "$services_list" ]; then
            for service in $services_list; do
                local status=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --filter "name=$service" --format "{{.State}}" 2>/dev/null)

                if [ "$status" != "running" ]; then
                    all_healthy=false
                    break
                fi
            done
        else
            # Check all critical services
            for service in nginx backend frontend postgres redis; do
                local status=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --filter "name=$service" --format "{{.State}}" 2>/dev/null)

                if [ "$status" != "running" ]; then
                    all_healthy=false
                    break
                fi
            done
        fi

        if [ "$all_healthy" = true ]; then
            print_success "All services are healthy"
            return 0
        fi

        sleep 5
        elapsed=$((elapsed + 5))
    done

    print_warning "Some services may not be fully healthy yet"
    print_info "Check status with: ./status.sh"
    return 1
}

# ============================================
# Main
# ============================================

main() {
    cd "$PROJECT_ROOT"

    print_header "Worklenz Service Restart"

    # Validate services if provided
    if [ ${#SERVICES[@]} -gt 0 ]; then
        validate_services
    fi

    # Build services list
    local services_list="${SERVICES[*]}"

    # Display what will be restarted
    if [ -z "$services_list" ]; then
        echo -e "  ${BOLD}Scope:${NC} All services"
    else
        echo -e "  ${BOLD}Services:${NC} $services_list"
    fi

    if [ "$HARD_RESTART" = true ]; then
        echo -e "  ${BOLD}Type:${NC} Hard restart (stop + start)"
    else
        echo -e "  ${BOLD}Type:${NC} Graceful restart"
    fi

    echo ""

    # Perform restart
    if [ "$HARD_RESTART" = true ]; then
        hard_restart "$services_list"
    else
        graceful_restart "$services_list"
    fi

    # Wait for services
    wait_for_health "$services_list"

    # Display status
    print_header "Restart Complete"

    echo -e "${GREEN}${BOLD}Services have been restarted successfully!${NC}"
    echo ""

    echo -e "  ${BOLD}Check status:${NC}  ./status.sh"
    echo -e "  ${BOLD}View logs:${NC}     ./logs.sh"
    echo -e "  ${BOLD}Access URL:${NC}    ${FRONTEND_URL}"

    echo ""
    print_success "Restart complete!"
}

# ============================================
# Run Main
# ============================================

main "$@"
