#!/bin/bash

# ============================================
# Worklenz Status Dashboard
# ============================================
# Display health status of all Worklenz services
#
# Usage:
#   ./status.sh [--json] [--watch]
#
# Options:
#   --json   Output status in JSON format
#   --watch  Continuously update status (refresh every 5s)
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/deploy/docker/compose/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/worklenz.env"

# Parse arguments
JSON_OUTPUT=false
WATCH_MODE=false

for arg in "$@"; do
    case $arg in
        --json)
            JSON_OUTPUT=true
            ;;
        --watch)
            WATCH_MODE=true
            ;;
        --help)
            echo "Usage: $0 [--json] [--watch]"
            echo ""
            echo "Options:"
            echo "  --json   Output status in JSON format"
            echo "  --watch  Continuously update status (refresh every 5s)"
            exit 0
            ;;
    esac
done

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Configuration file not found: $ENV_FILE"
    echo "Please run the installation script first."
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
    echo "Error: Docker Compose not found"
    exit 1
fi

# ============================================
# Helper Functions
# ============================================

get_container_status() {
    local service_name=$1
    local status=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --filter "name=${service_name}" --format "{{.State}}" 2>/dev/null || echo "not found")
    echo "$status"
}

get_container_health() {
    local service_name=$1
    local health=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --filter "name=${service_name}" --format "{{.Health}}" 2>/dev/null || echo "")

    if [ -z "$health" ]; then
        echo "no healthcheck"
    else
        echo "$health"
    fi
}

get_uptime() {
    local service_name=$1
    local uptime=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --filter "name=${service_name}" --format "{{.Status}}" 2>/dev/null | grep -oP 'Up \K[^)]+' || echo "down")
    echo "$uptime"
}

get_resource_usage() {
    local container_name=$1
    local stats=$(docker stats --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}" "$container_name" 2>/dev/null || echo "0%|0B / 0B")
    echo "$stats"
}

check_port_accessible() {
    local port=$1
    nc -z localhost "$port" >/dev/null 2>&1
    echo $?
}

get_disk_usage() {
    local path=${1:-/}
    df -h "$path" 2>/dev/null | awk 'NR==2 {print $3 " / " $2 " (" $5 " used)"}'
}

get_docker_volume_size() {
    local volume_name=$1
    docker system df -v 2>/dev/null | grep "$volume_name" | awk '{print $3}'
}

# ============================================
# Status Check Functions
# ============================================

check_service_status() {
    local service=$1
    local container_name=$2

    local state=$(get_container_status "$container_name")
    local health=$(get_container_health "$container_name")
    local uptime=$(get_uptime "$container_name")

    # Determine overall status
    local status_icon=""
    local status_color=""
    local status_text=""

    if [ "$state" = "running" ]; then
        if [ "$health" = "healthy" ] || [ "$health" = "no healthcheck" ]; then
            status_icon="✓"
            status_color="$GREEN"
            status_text="Running"
        elif [ "$health" = "starting" ]; then
            status_icon="⏳"
            status_color="$YELLOW"
            status_text="Starting"
        else
            status_icon="⚠"
            status_color="$YELLOW"
            status_text="Unhealthy"
        fi
    else
        status_icon="✗"
        status_color="$RED"
        status_text="Stopped"
    fi

    # Get resource usage
    local resources=$(get_resource_usage "$container_name")
    local cpu=$(echo "$resources" | cut -d'|' -f1)
    local mem=$(echo "$resources" | cut -d'|' -f2)

    # Output
    if [ "$JSON_OUTPUT" = true ]; then
        echo "\"$service\": {\"status\": \"$status_text\", \"health\": \"$health\", \"uptime\": \"$uptime\", \"cpu\": \"$cpu\", \"memory\": \"$mem\"}"
    else
        printf "  %-20s ${status_color}%-12s${NC} %-20s %-12s %-20s\n" \
            "${BOLD}$service${NC}" \
            "$status_icon $status_text" \
            "$uptime" \
            "$cpu" \
            "$mem"
    fi
}

check_network_connectivity() {
    local name=$1
    local host=$2
    local port=$3

    if nc -z "$host" "$port" >/dev/null 2>&1; then
        echo -e "  ${BOLD}$name${NC}        ${GREEN}✓ Connected${NC} (${host}:${port})"
    else
        echo -e "  ${BOLD}$name${NC}        ${RED}✗ Unreachable${NC} (${host}:${port})"
    fi
}

check_storage_health() {
    if [ "$STORAGE_PROVIDER" = "minio" ] && [ "$MINIO_TYPE" = "embedded" ]; then
        # Check MinIO volume
        local minio_size=$(get_docker_volume_size "worklenz_minio_data")
        echo -e "  ${BOLD}MinIO Storage${NC}  ${GREEN}✓ Active${NC} (${minio_size})"
    elif [ "$STORAGE_PROVIDER" = "s3" ]; then
        echo -e "  ${BOLD}S3 Storage${NC}     ${GREEN}✓ External${NC} (${S3_BUCKET})"
    elif [ "$STORAGE_PROVIDER" = "azure" ]; then
        echo -e "  ${BOLD}Azure Blob${NC}     ${GREEN}✓ External${NC} (${AZURE_STORAGE_CONTAINER})"
    fi
}

# ============================================
# Main Display Functions
# ============================================

display_header() {
    clear
    echo -e "${CYAN}${BOLD}"
    echo "╔════════════════════════════════════════════════════════════════════════════╗"
    echo "║                       WORKLENZ STATUS DASHBOARD                            ║"
    echo "╚════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo -e "${BLUE}Installation: ${BOLD}${INSTALLATION_MODE}${NC}  |  ${BLUE}Version: ${BOLD}${WORKLENZ_VERSION}${NC}  |  ${BLUE}Domain: ${BOLD}${DOMAIN}${NC}"
    echo ""
}

display_services_status() {
    echo -e "${BLUE}${BOLD}━━━ Services Status ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    printf "  %-20s %-12s %-20s %-12s %-20s\n" "SERVICE" "STATUS" "UPTIME" "CPU" "MEMORY"
    echo "  ────────────────────────────────────────────────────────────────────────────"

    check_service_status "Nginx" "worklenz_nginx"
    check_service_status "Frontend" "worklenz_frontend"
    check_service_status "Backend" "worklenz_backend"
    check_service_status "Worker" "worklenz_worker"
    check_service_status "PostgreSQL" "worklenz_postgres"
    check_service_status "Redis" "worklenz_redis"

    if [ "$MINIO_TYPE" = "embedded" ]; then
        check_service_status "MinIO" "worklenz_minio"
    fi

    echo ""
}

display_connectivity() {
    echo -e "${BLUE}${BOLD}━━━ Network Connectivity ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Check external ports
    if check_port_accessible "$HTTP_PORT" >/dev/null 2>&1; then
        echo -e "  ${BOLD}HTTP Port${NC}      ${GREEN}✓ Accessible${NC} (Port $HTTP_PORT)"
    else
        echo -e "  ${BOLD}HTTP Port${NC}      ${RED}✗ Not Accessible${NC} (Port $HTTP_PORT)"
    fi

    if [ "$USE_SSL" = "true" ]; then
        if check_port_accessible "$HTTPS_PORT" >/dev/null 2>&1; then
            echo -e "  ${BOLD}HTTPS Port${NC}     ${GREEN}✓ Accessible${NC} (Port $HTTPS_PORT)"
        else
            echo -e "  ${BOLD}HTTPS Port${NC}     ${RED}✗ Not Accessible${NC} (Port $HTTPS_PORT)"
        fi
    fi

    echo ""
}

display_storage() {
    echo -e "${BLUE}${BOLD}━━━ Storage Status ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    check_storage_health

    # Database volume
    local db_size=$(get_docker_volume_size "worklenz_postgres_data")
    echo -e "  ${BOLD}Database${NC}       ${GREEN}✓ Active${NC} (${db_size})"

    # Redis volume
    local redis_size=$(get_docker_volume_size "worklenz_redis_data")
    echo -e "  ${BOLD}Redis Cache${NC}    ${GREEN}✓ Active${NC} (${redis_size})"

    # Disk space
    local disk_usage=$(get_disk_usage "/")
    echo -e "  ${BOLD}Disk Space${NC}     ${disk_usage}"

    echo ""
}

display_system_info() {
    echo -e "${BLUE}${BOLD}━━━ System Information ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Docker version
    local docker_version=$(docker --version | grep -oP '\d+\.\d+\.\d+')
    echo -e "  ${BOLD}Docker${NC}         $docker_version"

    # Compose version
    local compose_version=$($COMPOSE_CMD version --short 2>/dev/null || echo "unknown")
    echo -e "  ${BOLD}Compose${NC}        $compose_version"

    # System load
    local load_avg=$(uptime | grep -oP 'load average: \K.*')
    echo -e "  ${BOLD}Load Average${NC}   $load_avg"

    # Memory usage
    local mem_usage=$(free -h | awk 'NR==2 {print $3 " / " $2}')
    echo -e "  ${BOLD}Memory${NC}         $mem_usage"

    echo ""
}

display_urls() {
    echo -e "${BLUE}${BOLD}━━━ Access URLs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    echo -e "  ${BOLD}Frontend:${NC}      ${CYAN}${FRONTEND_URL}${NC}"
    echo -e "  ${BOLD}Backend API:${NC}   ${CYAN}${BACKEND_URL}${NC}"
    echo -e "  ${BOLD}WebSocket:${NC}     ${CYAN}${SOCKET_URL}${NC}"

    if [ "$MINIO_TYPE" = "embedded" ]; then
        echo -e "  ${BOLD}MinIO Console:${NC} ${CYAN}http://localhost:9001${NC} (admin only)"
    fi

    echo ""
}

display_footer() {
    echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${CYAN}Last updated:${NC} $(date '+%Y-%m-%d %H:%M:%S')"

    if [ "$WATCH_MODE" = true ]; then
        echo -e "  ${YELLOW}Press Ctrl+C to exit watch mode${NC}"
    fi

    echo ""
}

# ============================================
# JSON Output
# ============================================

display_json() {
    cd "$PROJECT_ROOT"

    echo "{"
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"installation_mode\": \"$INSTALLATION_MODE\","
    echo "  \"version\": \"$WORKLENZ_VERSION\","
    echo "  \"domain\": \"$DOMAIN\","
    echo "  \"services\": {"

    check_service_status "nginx" "worklenz_nginx"
    echo "    ,"
    check_service_status "frontend" "worklenz_frontend"
    echo "    ,"
    check_service_status "backend" "worklenz_backend"
    echo "    ,"
    check_service_status "worker" "worklenz_worker"
    echo "    ,"
    check_service_status "postgres" "worklenz_postgres"
    echo "    ,"
    check_service_status "redis" "worklenz_redis"

    if [ "$MINIO_TYPE" = "embedded" ]; then
        echo "    ,"
        check_service_status "minio" "worklenz_minio"
    fi

    echo "  },"
    echo "  \"urls\": {"
    echo "    \"frontend\": \"$FRONTEND_URL\","
    echo "    \"backend\": \"$BACKEND_URL\","
    echo "    \"websocket\": \"$SOCKET_URL\""
    echo "  }"
    echo "}"
}

# ============================================
# Main
# ============================================

main() {
    cd "$PROJECT_ROOT"

    if [ "$JSON_OUTPUT" = true ]; then
        display_json
        exit 0
    fi

    if [ "$WATCH_MODE" = true ]; then
        while true; do
            display_header
            display_services_status
            display_connectivity
            display_storage
            display_system_info
            display_urls
            display_footer
            sleep 5
        done
    else
        display_header
        display_services_status
        display_connectivity
        display_storage
        display_system_info
        display_urls
        display_footer
    fi
}

main "$@"
