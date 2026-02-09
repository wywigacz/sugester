#!/bin/bash
#
# Sugester Deployment Script for mikr.us VPS
# Usage: ./deploy.sh [init|update|status|logs|restart]
#

set -euo pipefail

COMPOSE_FILE="docker/docker-compose.prod.yml"
PROJECT_NAME="sugester"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

# Check prerequisites
check_prereqs() {
    log "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Install with: curl -fsSL https://get.docker.com | sh"
        exit 1
    fi

    if ! command -v docker compose &> /dev/null; then
        # Try docker-compose (V1)
        if ! command -v docker-compose &> /dev/null; then
            error "Docker Compose is not installed."
            exit 1
        fi
        COMPOSE_CMD="docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME"
    else
        COMPOSE_CMD="docker compose -f $COMPOSE_FILE -p $PROJECT_NAME"
    fi

    if [ ! -f ".env.production" ]; then
        error ".env.production not found. Copy .env.production.example and configure."
        exit 1
    fi

    log "Prerequisites OK"
}

# Initial deployment
init() {
    log "Starting initial deployment..."
    check_prereqs

    # Set vm.max_map_count for Elasticsearch
    info "Setting vm.max_map_count for Elasticsearch..."
    if [ "$(sysctl -n vm.max_map_count 2>/dev/null)" -lt 262144 ] 2>/dev/null; then
        sudo sysctl -w vm.max_map_count=262144
        echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf > /dev/null
        log "vm.max_map_count set to 262144"
    else
        log "vm.max_map_count already OK"
    fi

    # Build and start all services
    log "Building and starting services..."
    $COMPOSE_CMD build --no-cache
    $COMPOSE_CMD up -d

    # Wait for Elasticsearch to be ready
    log "Waiting for Elasticsearch to be healthy..."
    local retries=0
    local max_retries=60
    while [ $retries -lt $max_retries ]; do
        if docker exec sugester-es curl -sf http://localhost:9200/_cluster/health > /dev/null 2>&1; then
            log "Elasticsearch is ready!"
            break
        fi
        retries=$((retries + 1))
        echo -n "."
        sleep 5
    done
    echo ""

    if [ $retries -eq $max_retries ]; then
        error "Elasticsearch failed to start. Check logs: $COMPOSE_CMD logs elasticsearch"
        exit 1
    fi

    # Create index and import data
    log "Creating Elasticsearch index..."
    docker exec sugester-backend node elasticsearch/scripts/create-index.js --force

    log "Importing product data from Cyfrowe.pl feed..."
    docker exec sugester-backend node scripts/import-feed.js --cyfrowe

    log "=========================================="
    log "Deployment complete!"
    log "=========================================="
    info "Application: http://localhost:80"
    info "Health check: http://localhost:80/health"
    info ""
    info "Next steps:"
    info "  1. Configure your domain DNS to point to this server"
    info "  2. Set up scheduled feed updates (see crontab below)"
    info ""
    info "Recommended crontab for data updates:"
    info "  # Update product feed every 6 hours"
    info '  0 */6 * * * cd /opt/sugester && docker exec sugester-backend node scripts/import-feed.js --cyfrowe >> /var/log/sugester-feed.log 2>&1'
}

# Update deployment (pull changes, rebuild, restart)
update() {
    log "Updating deployment..."
    check_prereqs

    # Rebuild and restart (with zero-downtime for backend)
    log "Rebuilding containers..."
    $COMPOSE_CMD build backend

    log "Restarting backend..."
    $COMPOSE_CMD up -d --no-deps backend

    # Re-import data if --with-data flag
    if [[ "${1:-}" == "--with-data" ]]; then
        log "Re-importing product data..."
        sleep 5  # Wait for backend to be ready
        docker exec sugester-backend node scripts/import-feed.js --cyfrowe
    fi

    log "Update complete!"
}

# Full rebuild (including ES)
rebuild() {
    log "Full rebuild..."
    check_prereqs

    $COMPOSE_CMD down
    $COMPOSE_CMD build --no-cache
    $COMPOSE_CMD up -d

    # Wait for ES
    log "Waiting for Elasticsearch..."
    sleep 30
    local retries=0
    while [ $retries -lt 60 ]; do
        if docker exec sugester-es curl -sf http://localhost:9200/_cluster/health > /dev/null 2>&1; then
            break
        fi
        retries=$((retries + 1))
        sleep 5
    done

    # Recreate index and import data
    log "Recreating index..."
    docker exec sugester-backend node elasticsearch/scripts/create-index.js --force

    log "Importing data..."
    docker exec sugester-backend node scripts/import-feed.js --cyfrowe

    log "Full rebuild complete!"
}

# Show status
status() {
    check_prereqs
    info "Container status:"
    $COMPOSE_CMD ps
    echo ""
    info "Health check:"
    curl -s http://localhost:80/health 2>/dev/null | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/health 2>/dev/null || echo "Backend not responding"
    echo ""
    info "Disk usage:"
    docker system df 2>/dev/null || true
}

# Show logs
logs() {
    check_prereqs
    $COMPOSE_CMD logs -f --tail=100 "${1:-}"
}

# Restart services
restart() {
    check_prereqs
    log "Restarting all services..."
    $COMPOSE_CMD restart
    log "Restart complete!"
}

# Stop everything
stop() {
    check_prereqs
    log "Stopping all services..."
    $COMPOSE_CMD down
    log "Stopped."
}

# Reimport feed data
reimport() {
    check_prereqs
    log "Re-importing product feed..."
    docker exec sugester-backend node scripts/import-feed.js --cyfrowe
    log "Import complete!"

    log "Flushing Redis cache..."
    docker exec sugester-redis redis-cli FLUSHALL
    log "Cache cleared!"
}

# Main
case "${1:-help}" in
    init)
        init
        ;;
    update)
        update "${2:-}"
        ;;
    rebuild)
        rebuild
        ;;
    status)
        status
        ;;
    logs)
        logs "${2:-}"
        ;;
    restart)
        restart
        ;;
    stop)
        stop
        ;;
    reimport)
        reimport
        ;;
    help|*)
        echo ""
        echo "Sugester Deployment Script"
        echo "=========================="
        echo ""
        echo "Usage: ./deploy.sh <command>"
        echo ""
        echo "Commands:"
        echo "  init              First-time deployment (build, start, create index, import data)"
        echo "  update            Update backend (rebuild + restart, no data re-import)"
        echo "  update --with-data  Update backend + re-import product feed"
        echo "  rebuild           Full rebuild (all containers, recreate index, re-import)"
        echo "  reimport          Re-import product feed + flush Redis cache"
        echo "  status            Show container status and health"
        echo "  logs [service]    Show logs (optional: elasticsearch, backend, redis, nginx)"
        echo "  restart           Restart all services"
        echo "  stop              Stop all services"
        echo "  help              Show this help"
        echo ""
        ;;
esac
