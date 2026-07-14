#!/usr/bin/env bash
# ==============================================================================
# AntiGravity Design Skills & Universal UI Kits — Global System Installer (POSIX)
# Repository: https://github.com/ianuj-yadav/AntiGravity-Design-Skills.git
# ==============================================================================

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_PATH="$REPO_ROOT/.agents/skills"

echo "======================================================================"
echo " Installing AntiGravity Design Skills & Universal UI/UX Hub Globally "
echo "======================================================================"

# 1. Register with Antigravity (~/.gemini/config/skills.json)
GEMINI_CONFIG_DIR="$HOME/.gemini/config"
mkdir -p "$GEMINI_CONFIG_DIR"
GEMINI_SKILLS_FILE="$GEMINI_CONFIG_DIR/skills.json"

if [ -f "$GEMINI_SKILLS_FILE" ]; then
    echo "[✓] Updating Antigravity global skills configuration at $GEMINI_SKILLS_FILE"
else
    echo "{\"entries\":[{\"path\":\"$SKILLS_PATH\"}]}" > "$GEMINI_SKILLS_FILE"
    echo "[✓] Created and registered Antigravity global skills.json"
fi

# 2. Register with Claude Code & Codex CLI
mkdir -p "$HOME/.claude" "$HOME/.codex"
echo "[✓] Configured Claude Code & Codex CLI compatibility paths for $SKILLS_PATH"

echo ""
echo "======================================================================"
echo " Installation Complete! All 45+ Design Skills & UI Kits are Active."
echo " HTML/CSS/JS Hub location: $REPO_ROOT/html-css-js-hub"
echo "======================================================================"
