#!/bin/bash
# Green Panorama - KiloClaw VPS Setup Script
# Run this once on the KiloClaw VPS to set up the research agent.
#
# Usage: bash setup.sh

set -e

echo "=== Green Panorama KiloClaw Setup ==="

# 1. Clone or update the repo
REPO_DIR="$HOME/green-panorama"
if [ -d "$REPO_DIR" ]; then
    echo "Updating existing repo..."
    cd "$REPO_DIR"
    git pull origin feature/research-agents
else
    echo "Cloning repository..."
    git clone -b feature/research-agents https://github.com/DanteDia/argentina-green-panorama.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

# 2. Install Python dependencies
echo "Installing Python dependencies..."
cd "$REPO_DIR/backend"
pip3 install --user -r requirements.txt 2>/dev/null || pip install -r requirements.txt

# 3. Create data directory
mkdir -p "$REPO_DIR/backend/data"

# 4. Copy OpenClaw skill
SKILLS_DIR="$HOME/.openclaw/skills/green-panorama-research"
if [ -d "$HOME/.openclaw" ]; then
    echo "Installing OpenClaw skill..."
    mkdir -p "$SKILLS_DIR"
    cp "$REPO_DIR/backend/openclaw/skills/green-panorama-research/SKILL.md" "$SKILLS_DIR/"
    echo "Skill installed at: $SKILLS_DIR"
else
    SKILLS_DIR="$HOME/.openclaw/workspace/skills/green-panorama-research"
    mkdir -p "$SKILLS_DIR"
    cp "$REPO_DIR/backend/openclaw/skills/green-panorama-research/SKILL.md" "$SKILLS_DIR/"
    echo "Skill installed at: $SKILLS_DIR"
fi

# 5. Copy AGENTS.md to workspace
WORKSPACE="$HOME/.openclaw/workspace"
if [ -d "$WORKSPACE" ]; then
    echo "Updating AGENTS.md in workspace..."
    cp "$REPO_DIR/backend/openclaw/AGENTS.md" "$WORKSPACE/AGENTS.md"
elif [ -d "$HOME/.openclaw" ]; then
    mkdir -p "$WORKSPACE"
    cp "$REPO_DIR/backend/openclaw/AGENTS.md" "$WORKSPACE/AGENTS.md"
fi

# 6. Check environment
echo ""
echo "=== Environment Check ==="

if [ -f "$REPO_DIR/backend/.env" ]; then
    source "$REPO_DIR/backend/.env"
    if [ -n "$SUPABASE_URL" ]; then
        echo "SUPABASE_URL: configured"
    else
        echo "WARNING: SUPABASE_URL not set in backend/.env"
    fi
    if [ -n "$SUPABASE_KEY" ]; then
        echo "SUPABASE_KEY: configured"
    else
        echo "WARNING: SUPABASE_KEY not set in backend/.env"
    fi
    if [ -n "$OPENROUTER_API_KEY" ]; then
        echo "OPENROUTER_API_KEY: configured"
    else
        echo "WARNING: OPENROUTER_API_KEY not set in backend/.env"
    fi
else
    echo "WARNING: backend/.env not found. Create it with SUPABASE_URL, SUPABASE_KEY, OPENROUTER_API_KEY"
fi

# 7. Test db_helpers
echo ""
echo "=== Testing Database Connection ==="
cd "$REPO_DIR/backend"
python3 -m agents.db_helpers stats 2>/dev/null && echo "Database connection OK" || echo "WARNING: Database connection failed. Check credentials."

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Ensure backend/.env has SUPABASE_URL, SUPABASE_KEY, OPENROUTER_API_KEY"
echo "  2. Seed the database: cd $REPO_DIR/backend && python3 seed/seed_to_supabase.py"
echo "  3. Set up the cron job: bash $REPO_DIR/backend/openclaw/cron-setup.sh"
echo "  4. Restart OpenClaw: openclaw gateway restart"
