#!/bin/bash
# Green Panorama - Hostinger VPS Setup Script
# Run once after SSH-ing into the VPS.
#
# Usage: bash setup-vps.sh
#
# Prerequisites: VPS with Ubuntu 22.04+, SSH access as root

set -e

echo "=== Green Panorama VPS Setup ==="

# 1. System packages
echo "Installing system packages..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv git > /dev/null

# 2. Clone or update repo
REPO_DIR="/root/green-panorama"
BRANCH="feature/research-agents"

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

# 3. Install Python dependencies
echo "Installing Python dependencies..."
cd "$REPO_DIR/backend"
pip3 install -q -r requirements.txt

# 4. Create data directory
mkdir -p "$REPO_DIR/backend/data"

# 5. Create .env if it doesn't exist
if [ ! -f "$REPO_DIR/backend/.env" ]; then
    echo ""
    echo "=== IMPORTANT: Create your .env file ==="
    echo "Run this command and fill in your credentials:"
    echo ""
    echo "cat > $REPO_DIR/backend/.env << 'ENVEOF'"
    echo 'SUPABASE_URL=https://iedjqmfbjegvlklslbtm.supabase.co'
    echo 'SUPABASE_KEY=your_supabase_anon_key_here'
    echo 'OPENROUTER_API_KEY=your_openrouter_key_here'
    echo "ENVEOF"
    echo ""
else
    echo ".env already exists."
fi

# 6. Install systemd service
echo "Installing systemd service..."
cp "$REPO_DIR/backend/deploy/green-panorama-research.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable green-panorama-research

# 7. Test database connection
echo ""
echo "=== Testing Database Connection ==="
cd "$REPO_DIR/backend"
if [ -f .env ]; then
    python3 -m agents.db_helpers stats 2>/dev/null && echo "Database connection: OK" || echo "WARNING: Database connection failed. Check .env credentials."
else
    echo "Skipping test - .env not created yet."
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Create/verify .env: nano $REPO_DIR/backend/.env"
echo "  2. Test single cycle: cd $REPO_DIR/backend && python3 -m agents.research_daemon --once"
echo "  3. Start the service: systemctl start green-panorama-research"
echo "  4. Check status: systemctl status green-panorama-research"
echo "  5. View logs: journalctl -u green-panorama-research -f"
