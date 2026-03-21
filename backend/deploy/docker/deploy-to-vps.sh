#!/bin/bash
# Deploy Green Panorama Research Agent to Hostinger VPS as Docker container
#
# Usage: bash deploy-to-vps.sh
# Runs on the VPS after cloning the repo.

set -e

REPO_DIR="/root/green-panorama"
BRANCH="feature/research-agents"

echo "=== Green Panorama Docker Deployment ==="

# 1. Clone or update repo
if [ -d "$REPO_DIR" ]; then
    echo "Updating existing repo..."
    cd "$REPO_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
else
    echo "Cloning repository..."
    git clone -b "$BRANCH" https://github.com/DanteDia/argentina-green-panorama.git "$REPO_DIR"
fi

cd "$REPO_DIR"

# 2. Check for .env
if [ ! -f "backend/.env" ]; then
    echo ""
    echo "ERROR: backend/.env not found. Create it first:"
    echo ""
    echo "cat > $REPO_DIR/backend/.env << 'EOF'"
    echo "SUPABASE_URL=https://iedjqmfbjegvlklslbtm.supabase.co"
    echo "SUPABASE_KEY=your_key_here"
    echo "OPENROUTER_API_KEY=your_key_here"
    echo "EOF"
    exit 1
fi

# 3. Build and start
echo "Building Docker container..."
cd "$REPO_DIR/backend/deploy/docker"
docker compose up -d --build

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Container status:"
docker ps --filter name=green-panorama-research
echo ""
echo "View logs:  docker logs -f green-panorama-research"
echo "Stop:       docker compose -f $REPO_DIR/backend/deploy/docker/docker-compose.yml down"
echo "Restart:    docker compose -f $REPO_DIR/backend/deploy/docker/docker-compose.yml restart"
