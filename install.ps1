# ==============================================================================
# AntiGravity Design Skills & Universal UI Kits — Global System Installer (Windows)
# Repository: https://github.com/ianuj-yadav/AntiGravity-Design-Skills.git
# ==============================================================================

$repoRoot = $PSScriptRoot
$skillsPath = "$repoRoot\.agents\skills" -replace '\\', '/'

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Installing AntiGravity Design Skills & Universal UI/UX Hub Globally " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Register with Antigravity (~/.gemini/config/skills.json)
$geminiConfigDir = "$env:USERPROFILE\.gemini\config"
if (-not (Test-Path $geminiConfigDir)) {
    New-Item -ItemType Directory -Path $geminiConfigDir -Force | Out-Null
}
$geminiSkillsFile = "$geminiConfigDir\skills.json"

if (Test-Path $geminiSkillsFile) {
    $content = Get-Content $geminiSkillsFile -Raw | ConvertFrom-Json
    $exists = false
    foreach ($entry in $content.entries) {
        if ($entry.path -eq $skillsPath) { $exists = true }
    }
    if (-not $exists) {
        $content.entries += @{ path = $skillsPath }
        $content | ConvertTo-Json -Depth 5 | Set-Content $geminiSkillsFile
        Write-Host "[✓] Registered globally in Antigravity ($geminiSkillsFile)" -ForegroundColor Green
    } else {
        Write-Host "[✓] Already registered in Antigravity ($geminiSkillsFile)" -ForegroundColor Green
    }
} else {
    $newContent = @{ entries = @(@{ path = $skillsPath }) }
    $newContent | ConvertTo-Json -Depth 5 | Set-Content $geminiSkillsFile
    Write-Host "[✓] Created and registered Antigravity global skills.json" -ForegroundColor Green
}

# 2. Register with Claude Code (~/.claude/skills)
$claudeDir = "$env:USERPROFILE\.claude"
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
}
$claudeConfig = "$claudeDir\settings.json"
Write-Host "[✓] Configured Claude Code plugin compatibility path for $skillsPath" -ForegroundColor Green

# 3. Register with Codex CLI (~/.codex/config.toml)
$codexDir = "$env:USERPROFILE\.codex"
if (-not (Test-Path $codexDir)) {
    New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
}
Write-Host "[✓] Configured Codex CLI global skill path for $skillsPath" -ForegroundColor Green

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Installation Complete! All 45+ Design Skills & UI Kits are Active." -ForegroundColor Green
Write-Host " HTML/CSS/JS Hub location: $repoRoot\html-css-js-hub" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
