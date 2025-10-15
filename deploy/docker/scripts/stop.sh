#!/bin/bash

# ============================================
# Worklenz Stop Script
# ============================================
# Gracefully stop Worklenz services
#
# Usage:
#   ./stop.sh [service...]          # Stop specific services
#   ./stop.sh                       # Stop all services
#   ./stop.sh --force               # Force stop
#   ./stop.sh --remove              # Stop and remove containers
#
# Examples:
#   ./stop.sh                       # Graceful stop all
#   ./stop.sh backend               # Stop backend only
#   ./stop.sh --force               # Force kill all
#   ./stop.sh --remove              # Stop and cleanup
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
FORCE_STOP=false
REMOVE_CONTAINERS=false
SERVICES=()

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE_STOP=true
            shift
            ;;
        --remove|-r)
            REMOVE_CONTAINERS=true
            shift
            ;;
        --help)
            echo "Usage: $0 [service...] [--force] [--remove]"
            echo ""
            echo "Stop Worklenz services gracefully"
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
            echo "  --force, -f    Force stop (SIGKILL)"
            echo "  --remove, -r   Remove containers after stopping"
            echo ""
            echo "Examples:"
            echo "  $0                    # Stop all gracefully"
            echo "  $0 backend            # Stop backend only"
            echo "  $0 --force            # Force kill all"
            echo "  $0 --remove           # Stop and remove containers"
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
# Stop Functions
# ============================================

graceful_stop() {
    local services_list="$1"

    print_step "Gracefully stopping services..."

    # Services to stop in order (reverse of startup)
    if [ -z "$services_list" ]; then
        print_info "Stopping: nginx, frontend, backend, worker"
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop nginx frontend backend worker

        print_info "Stopping: redis, minio, postgres"
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop redis minio postgres 2>/dev/null || true
    else
        print_info "Stopping: $services_list"
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop $services_list
    fi

    print_success "Services stopped gracefully"
}

force_stop() {
    local services_list="$1"

    print_warning "Force stopping services (SIGKILL)..."

    if [ -z "$services_list" ]; then
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" kill
    else
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" kill $services_list
    fi

    print_success "Services force stopped"
}

remove_containers() {
    local services_list="$1"

    print_step "Removing containers..."

    if [ -z "$services_list" ]; then
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" rm -f
    else
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" rm -f $services_list
    fi

    print_success "Containers removed"
}

down_all() {
    print_warning "Stopping and removing all containers..."
    print_info "Networks and volumes will be preserved"

    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

    print_success "All containers stopped and removed"
}

# ============================================
# Pre-Stop Checks
# ============================================

check_running_services() {
    print_step "Checking running services..."

    local running_services=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --services --filter "status=running" 2>/dev/null)

    if [ -z "$running_services" ]; then
        print_info "No services are currently running"
        return 1
    fi

    print_success "Found running services:"
    echo "$running_services" | sed 's/^/  - /'
    echo ""

    return 0
}

# ============================================
# Main
# ============================================

main() {
    cd "$PROJECT_ROOT"

    print_header "Worklenz Service Stop"

    # Check if services are running
    if ! check_running_services; then
        print_info "Nothing to stop"
        exit 0
    fi

    # Validate services if provided
    if [ ${#SERVICES[@]} -gt 0 ]; then
        validate_services
    fi

    # Build services list
    local services_list="${SERVICES[*]}"

    # Display what will be stopped
    if [ -z "$services_list" ]; then
        echo -e "  ${BOLD}Scope:${NC} All services"
    else
        echo -e "  ${BOLD}Services:${NC} $services_list"
    fi

    if [ "$FORCE_STOP" = true ]; then
        echo -e "  ${BOLD}Method:${NC} Force stop (SIGKILL)"
    else
        echo -e "  ${BOLD}Method:${NC} Graceful stop (SIGTERM)"
    fi

    if [ "$REMOVE_CONTAINERS" = true ]; then
        echo -e "  ${BOLD}Cleanup:${NC} Remove containers after stopping"
    fi

    echo ""

    # Confirmation for important operations
    if [ -z "$services_list" ] && [ "$REMOVE_CONTAINERS" = true ]; then
        print_warning "This will stop and remove all containers"
        if ! prompt_yn "Continue?"; then
            print_info "Operation cancelled"
            exit 0
        fi
    fi

    # Perform stop
    if [ "$REMOVE_CONTAINERS" = true ] && [ -z "$services_list" ]; then
        # Use down for complete cleanup
        down_all
    else
        # Stop services
        if [ "$FORCE_STOP" = true ]; then
            force_stop "$services_list"
        else
            graceful_stop "$services_list"
        fi

        # Remove containers if requested
        if [ "$REMOVE_CONTAINERS" = true ]; then
            remove_containers "$services_list"
        fi
    fi

    # Verify stopped
    print_step "Verifying services are stopped..."
    sleep 2

    local still_running=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --services --filter "status=running" 2>/dev/null)

    if [ -z "$still_running" ]; then
        print_success "All services stopped"
    else
        print_warning "Some services may still be running:"
        echo "$still_running" | sed 's/^/  - /'
    fi

    # Display status
    print_header "Stop Complete"

    echo -e "${GREEN}${BOLD}Services have been stopped!${NC}"
    echo ""

    echo -e "  ${BOLD}To start again:${NC}    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d"
    echo -e "  ${BOLD}Or use:${NC}            cd deploy/docker/scripts && ./restart.sh"
    echo -e "  ${BOLD}Check status:${NC}      ./status.sh"

    echo ""
    print_success "Stop complete!"
}

# ============================================
# Run Main
# ============================================

main "$@"
