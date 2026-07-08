# Playwright Browser Automation Mode / 浏览器自动化模式

## Overview / 概述

This mode uses Playwright to control Chrome via CDP, automating the Stitch web UI directly.
No gcloud or OAuth setup needed — just a logged-in Chrome browser.

此模式通过 Playwright 控制 Chrome 浏览器，直接自动化 Stitch 网页界面。
不需要 gcloud 或 OAuth —— 只需已登录的 Chrome。

## Prerequisites / 前置条件

1. **Chrome browser** running with CDP enabled (port 18800)
2. **Google account** logged in at stitch.withgoogle.com
3. **playwright-core** npm package installed
4. **unzip** command available

For OpenClaw users:
```bash
openclaw browser start          # Start Chrome with CDP
# Then login to Google at stitch.withgoogle.com in Chrome
```

For other setups:
```bash
# Start Chrome with remote debugging
google-chrome --remote-debugging-port=18800
# Or on macOS:
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=18800
```

## Usage / 使用方法

```bash
node scripts/stitch-generate.js --prompt "DESCRIPTION" [--type app|web] [--output DIR]
```

### Arguments / 参数

| Arg | Required | Default | Description / 描述 |
|-----|----------|---------|-------------------|
| `--prompt` | ✅ | — | UI description / UI 描述 |
| `--type` | ❌ | `app` | `app` or `web` / 应用或网页 |
| `--output` | ❌ | `/tmp/stitch-*` | Output directory / 输出目录 |

### Examples / 示例

```bash
# English prompt, web type / 英文描述，网页类型
node scripts/stitch-generate.js \
  --prompt "eSIM pricing comparison with 3 tier cards and dark header" \
  --type web \
  --output ./esim-pricing

# Chinese prompt, app type / 中文描述，应用类型
node scripts/stitch-generate.js \
  --prompt "音乐播放器界面，深色主题，底部播放栏" \
  --type app \
  --output ./music-player

# Detailed prompt / 详细描述
node scripts/stitch-generate.js \
  --prompt "Dashboard for IoT device management. Left sidebar nav, top stats cards, main area with device list table, right panel with device details. Primary color #2563EB, Inter font." \
  --type web
```

## Output Files / 输出文件

| File | Description / 描述 |
|------|-------------------|
| `code.html` | Complete HTML+Tailwind CSS, opens in any browser / 完整代码，可直接浏览器打开 |
| `screen.png` | Design screenshot from Stitch / Stitch 设计截图 |
| `DESIGN.md` | Design system doc: colors, fonts, components / 设计系统文档 |
| `stitch.zip` | Original ZIP archive / 原始 ZIP 包 |
| `preview.png` | Full page screenshot / 全页截图 |

## How It Works / 工作原理

1. Connects to Chrome via CDP (port 18800)
2. Opens stitch.withgoogle.com in a new tab
3. Finds the app iframe (`app-companion-430619.appspot.com`)
4. Selects platform type (App/Web button)
5. Types prompt into the contenteditable input
6. Clicks "生成设计" (Generate) button
7. Polls for completion (checks for "More" button appearance)
8. Clicks More → 下载 (Download) to get ZIP
9. Extracts ZIP to output directory

## Architecture Notes / 架构说明

Stitch is an Angular SPA. The actual UI lives inside an iframe:
- Main frame: `stitch.withgoogle.com`
- App frame: `app-companion-430619.appspot.com` (contains all interactive elements)

All interactions must target the app iframe, not the main frame.

## Troubleshooting / 故障排查

**"browserType.connectOverCDP: connect ECONNREFUSED"**
→ Chrome not running or CDP not on port 18800. Start browser first.
→ Chrome 未运行或 CDP 不在 18800 端口。先启动浏览器。

**Empty page / page text is "EMPTY"**
→ SPA not fully loaded. Script waits 10s, but try increasing timeout.
→ SPA 未完全加载。脚本等待 10 秒，可尝试增加等待时间。

**"找不到 prompt 输入框"**
→ Google account not logged in, or Stitch UI changed.
→ Google 账号未登录，或 Stitch UI 有更新。

**Download not triggered / 下载未触发**
→ Script falls back to code extraction via "查看代码" menu.
→ 脚本会回退到通过"查看代码"菜单提取代码。
