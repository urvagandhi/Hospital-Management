#!/usr/bin/env bash
# Hospital Management System - Build Script
# Builds backend, frontend, and (optionally) Android app

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
    echo "Usage: ./BUILD [command]"
    echo ""
    echo "Commands:"
    echo "  all          Build backend + frontend (default)"
    echo "  backend      Install backend dependencies"
    echo "  frontend     Build frontend for production"
    echo "  android      Build Android APK (requires Android SDK)"
    echo "  dev          Start backend + frontend in dev mode"
    echo "  clean        Remove build artifacts and node_modules"
    echo "  check        Verify prerequisites are installed"
    echo ""
    echo "Examples:"
    echo "  ./BUILD              # builds everything"
    echo "  ./BUILD dev          # starts dev servers"
    echo "  ./BUILD frontend     # builds only frontend"
}

check_prereqs() {
    local missing=0
    for cmd in node npm; do
        if command -v "$cmd" &>/dev/null; then
            echo -e "${GREEN}OK${NC}  $cmd $(command $cmd --version 2>/dev/null | head -1)"
        else
            echo -e "${RED}MISSING${NC}  $cmd"
            missing=1
        fi
    done

    if [ -f "$ROOT_DIR/backend/.env" ]; then
        echo -e "${GREEN}OK${NC}  backend/.env exists"
    else
        echo -e "${YELLOW}WARN${NC}  backend/.env not found (copy from .env.example)"
    fi

    return $missing
}

build_backend() {
    echo "-- Building backend --"
    cd "$ROOT_DIR/backend"
    npm install --production
    echo -e "${GREEN}Backend build complete.${NC}"
}

build_frontend() {
    echo "-- Building frontend --"
    cd "$ROOT_DIR/frontend"
    npm install
    npm run build
    echo -e "${GREEN}Frontend build complete. Output in frontend/dist/${NC}"
}

build_android() {
    echo "-- Building Android APK --"
    cd "$ROOT_DIR/android-app"
    if [ -f "./build-apk.sh" ]; then
        chmod +x build-apk.sh
        ./build-apk.sh "${2:-debug}"
    else
        echo -e "${RED}build-apk.sh not found in android-app/${NC}"
        exit 1
    fi
}

dev_mode() {
    echo "-- Starting dev servers --"
    check_prereqs || { echo -e "${RED}Fix missing prerequisites first.${NC}"; exit 1; }

    cd "$ROOT_DIR/backend"
    npm install

    cd "$ROOT_DIR/frontend"
    npm install

    echo ""
    echo "Starting backend (port 5000) and frontend (port 5173)..."
    echo "Press Ctrl+C to stop both."
    echo ""

    cd "$ROOT_DIR/backend" && npm run dev &
    BACKEND_PID=$!

    cd "$ROOT_DIR/frontend" && npm run dev &
    FRONTEND_PID=$!

    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
    wait
}

clean() {
    echo "-- Cleaning build artifacts --"
    rm -rf "$ROOT_DIR/frontend/dist"
    rm -rf "$ROOT_DIR/frontend/node_modules"
    rm -rf "$ROOT_DIR/backend/node_modules"
    rm -rf "$ROOT_DIR/backend/coverage"
    echo -e "${GREEN}Clean complete.${NC}"
}

# --- Main ---

COMMAND="${1:-all}"

case "$COMMAND" in
    all)
        check_prereqs || { echo -e "${RED}Fix missing prerequisites first.${NC}"; exit 1; }
        build_backend
        build_frontend
        echo ""
        echo -e "${GREEN}Build successful.${NC}"
        echo "  Backend:  cd backend && npm start"
        echo "  Frontend: serve frontend/dist/ or deploy to hosting"
        ;;
    backend)
        build_backend
        ;;
    frontend)
        build_frontend
        ;;
    android)
        build_android
        ;;
    dev)
        dev_mode
        ;;
    clean)
        clean
        ;;
    check)
        check_prereqs
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        usage
        exit 1
        ;;
esac
