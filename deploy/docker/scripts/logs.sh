#!/bin/bash

# ============================================
# Worklenz Log Viewer
# ============================================
# View and manage Worklenz service logs
#
# Usage:
#   ./logs.sh [service] [--follow] [--tail N] [--since TIME]
#
# Examples:
#   ./logs.sh                    # View all logs
#   ./logs.sh backend            # View backend logs
#   ./logs.sh --follow           # Follow all logs
#   ./logs.sh backend --tail 100 # Last 100 lines
#   ./logs.sh --since 1h         # Logs from last hour
# ============================================

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/deploy/docker/compose/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/worklenz.env"

# Default values
SERVICE=""
FOLLOW_MODE=false
TAIL_LINES=""
SINCE_TIME=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --follow|-f)
            FOLLOW_MODE=true
            shift
            ;;
        --tail|-n)
            TAIL_LINES="$2"
            shift 2
            ;;
        --since)
            SINCE_TIME="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [service] [--follow] [--tail N] [--since TIME]"
            echo ""
            echo "Services:"
            echo "  nginx      - Nginx reverse proxy logs"
            echo "  frontend   - React frontend logs"
            echo "  backend    - Express API server logs"
            echo "  worker     - Background worker logs"
            echo "  postgres   - PostgreSQL database logs"
            echo "  redis      - Redis cache logs"
            echo "  minio      - MinIO storage logs (if embedded)"
            echo ""
            echo "Options:"
            echo "  --follow, -f       Follow log output (live tail)"
            echo "  --tail N, -n N     Show last N lines (default: all)"
            echo "  --since TIME       Show logs since timestamp (e.g., 1h, 30m, 2022-01-01)"
            echo ""
            echo "Examples:"
            echo "  $0                     # View all logs"
            echo "  $0 backend             # View backend logs"
            echo "  $0 --follow            # Follow all logs"
            echo "  $0 backend --tail 100  # Last 100 lines of backend"
            echo "  $0 --since 1h          # All logs from last hour"
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
        *)
            SERVICE="$1"
            shift
            ;;
    esac
done

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Configuration file not found: $ENV_FILE"
    exit 1
fi

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
# Main
# ============================================

cd "$PROJECT_ROOT"

# Build the logs command
LOGS_CMD="$COMPOSE_CMD -f $COMPOSE_FILE --env-file $ENV_FILE logs"

# Add options
if [ "$FOLLOW_MODE" = true ]; then
    LOGS_CMD="$LOGS_CMD --follow"
fi

if [ -n "$TAIL_LINES" ]; then
    LOGS_CMD="$LOGS_CMD --tail $TAIL_LINES"
fi

if [ -n "$SINCE_TIME" ]; then
    LOGS_CMD="$LOGS_CMD --since $SINCE_TIME"
fi

# Add service if specified
if [ -n "$SERVICE" ]; then
    # Validate service name
    case $SERVICE in
        nginx|frontend|backend|worker|postgres|redis|minio)
            LOGS_CMD="$LOGS_CMD $SERVICE"
            ;;
        *)
            echo "Error: Unknown service '$SERVICE'"
            echo "Valid services: nginx, frontend, backend, worker, postgres, redis, minio"
            echo "Use --help for more information"
            exit 1
            ;;
    esac
fi

# Execute the logs command
exec $LOGS_CMD
