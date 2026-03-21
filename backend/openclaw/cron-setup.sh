#!/bin/bash
# Green Panorama - Configure OpenClaw Cron Job for Research Agent
# Run after setup.sh to start the 24/7 research cycle.
#
# Usage: bash cron-setup.sh

set -e

echo "=== Setting up Green Panorama Research Cron Job ==="

# Add cron job: runs every 10 minutes in an isolated session
openclaw cron add \
  --name "green-panorama-research" \
  --every 600000 \
  --session isolated \
  --message "Run a Green Panorama research cycle using the green_panorama_research skill. Pick the next unvisited company, browse its website, search for partners, check for duplicates, and add new discoveries to the database. Report a brief summary when done."

echo ""
echo "Cron job created! Research will run every 10 minutes."
echo ""
echo "Useful commands:"
echo "  openclaw cron list                    # View all cron jobs"
echo "  openclaw cron runs --limit 10         # See recent runs"
echo "  openclaw cron run green-panorama-research  # Trigger manually"
echo ""
echo "To change interval:"
echo "  openclaw cron edit green-panorama-research --every 300000   # 5 min"
echo "  openclaw cron edit green-panorama-research --every 1800000  # 30 min"
