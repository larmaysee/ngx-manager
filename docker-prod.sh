#!/bin/bash

# Production Docker Compose Script
# Usage: ./docker-prod.sh [command]
# Examples:
#   ./docker-prod.sh up -d
#   ./docker-prod.sh down
#   ./docker-prod.sh logs -f

docker compose -f docker-compose.prod.yml "$@"