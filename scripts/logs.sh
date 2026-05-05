#!/bin/bash

# MyMediVault Log Viewer Utility
# Usage: ./scripts/logs.sh [backend|sidecar|frontend|all]

SERVICE=$1

case $SERVICE in
  "backend")
    echo "--- Tailing Backend (Node.js) Logs ---"
    docker compose logs -f backend
    ;;
  "sidecar"|"compression")
    echo "--- Tailing Compression Service (Python) Logs ---"
    docker compose logs -f compression-service
    ;;
  "frontend")
    echo "--- Tailing Frontend (Nginx) Logs ---"
    docker compose logs -f frontend
    ;;
  "all"|*)
    echo "--- Tailing All Service Logs ---"
    docker compose logs -f
    ;;
esac
