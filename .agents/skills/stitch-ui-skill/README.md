# stitch-ui

> Google Stitch UI design automation for [OpenClaw](https://github.com/openclaw/openclaw) and AI agents.
>
> 通过 Google Stitch Remote MCP API 自动生成 UI 设计，导出生产级 HTML+Tailwind 代码。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What is this? / 这是什么？

An [AgentSkill](https://docs.openclaw.ai) that lets AI agents generate production-ready UI code from natural language prompts using [Google Stitch](https://stitch.withgoogle.com)'s official Remote MCP API.

一个 AgentSkill 插件，通过 Google Stitch 官方 Remote MCP API 用自然语言生成生产级 UI 代码。

**Input:**
> "A pricing page with 3 tier cards, monthly/yearly toggle, dark header, primary color #0056D2"

**Output:**
- Production-ready HTML + Tailwind CSS code
- Design system tokens (colors, fonts, components)
- Design screenshots and variants

## Two Modes / 两种模式

| | MCP API (Recommended) | Playwright (Fallback) |
|---|---------|------------|
| **How** | Direct Remote MCP calls | Browser automation via Chrome CDP |
| **Auth** | API Key or OAuth | Logged-in Chrome browser |
| **Setup** | 2 steps (generate key + configure) | `openclaw browser start` + login |
| **Output** | Screen data, HTML code, design systems | Full ZIP (HTML + screenshot + design doc) |
| **Best for** | All workflows, programmatic use | When MCP is unavailable |

## Quick Start / 快速开始

### Install / 安装

```bash
# OpenClaw users / OpenClaw 用户
openclaw skills install stitch-ui

# Manual / 手动安装
git clone https://github.com/cloudlinkhk/stitch-ui-skill.git
cp -r stitch-ui-skill ~/.openclaw/workspace/skills/stitch-ui
```

### Mode 1: MCP API (Recommended) / MCP 模式（推荐）

**Step 1 — Get API Key / 获取 API Key:**

Go to [Stitch Settings](https://stitch.withgoogle.com) → API Keys → Create API Key.

前往 Stitch 设置页面 → API Keys → 创建 API Key。

**Step 2 — Configure / 配置:**

```bash
# Claude Code
claude mcp add stitch \
  --transport http https://stitch.googleapis.com/mcp \
  --header "X-Goog-Api-Key: YOUR_KEY" \
  -s user
```

```json
// Cursor (.cursor/mcp.json)
{
  "mcpServers": {
    "stitch": {
      "url": "https://stitch.googleapis.com/mcp",
      "headers": { "X-Goog-Api-Key": "YOUR_KEY" }
    }
  }
}
```

For VSCode, Antigravity, Gemini CLI, and OAuth setup — see [references/mcp-setup.md](references/mcp-setup.md).

**Step 3 — Verify / 验证:**

Ask your AI agent: "List my Stitch projects" — it should return your projects.

**Use / 使用:**

Once configured, your AI agent has direct access to all Stitch MCP tools. Just describe what you want:
- "Create a new project called My App"
- "Generate a pricing page with 3 tier cards"
- "Edit the screen to use dark mode"
- "Create a design system with brand colors #0056D2 and Inter font"

### Mode 2: Playwright (Fallback) / Playwright 模式（备选）

**Prerequisites / 前置条件:**
```bash
npm install -g playwright-core
```

**Start Chrome / 启动 Chrome：**
```bash
# OpenClaw
openclaw browser start

# Or manually / 或手动
open -a "Google Chrome" --args --remote-debugging-port=18800
```

Then log into Google at https://stitch.withgoogle.com.

**Generate / 生成：**
```bash
node scripts/stitch-generate.js \
  --prompt "A dashboard for IoT device management with sidebar nav and stats cards" \
  --type web \
  --output ./my-dashboard
```

**Output / 输出：**
```
my-dashboard/
├── code.html       ← Open in browser / 浏览器直接打开
├── screen.png      ← Design preview / 设计预览
├── DESIGN.md       ← Design system / 设计系统文档
└── stitch.zip      ← Original archive / 原始压缩包
```

See [references/playwright-mode.md](references/playwright-mode.md) for details.

## MCP Tools (12) / MCP 工具列表

### Project Management / 项目管理
| Tool | Description / 描述 |
|------|-------------------|
| `create_project` | Create a new design project / 创建设计项目 |
| `list_projects` | List all projects / 列出所有项目 |
| `get_project` | Get project details / 获取项目详情 |

### Screen Management / 页面管理
| Tool | Description / 描述 |
|------|-------------------|
| `list_screens` | List screens in a project / 列出项目中的页面 |
| `get_screen` | Get screen details and HTML code / 获取页面详情和代码 |

### AI Generation / AI 生成
| Tool | Description / 描述 |
|------|-------------------|
| `generate_screen_from_text` | Generate UI from text prompt / 从描述生成 UI |
| `edit_screens` | Edit existing screens with prompt / 编辑现有页面 |
| `generate_variants` | Generate design variations / 生成设计变体 |

### Design Systems / 设计系统
| Tool | Description / 描述 |
|------|-------------------|
| `create_design_system` | Create design system with tokens / 创建设计系统 |
| `update_design_system` | Update design system / 更新设计系统 |
| `list_design_systems` | List all design systems / 列出设计系统 |
| `apply_design_system` | Apply design system to screens / 应用设计系统到页面 |

## Models / 可用模型

| Model | Speed | Quality | Notes |
|-------|-------|---------|-------|
| `GEMINI_3_FLASH` | Fast | Good | Default, recommended / 默认推荐 |
| `GEMINI_3_1_PRO` | Slower | Best | Complex UI / 复杂界面 |

## Device Types / 设备类型

`MOBILE` · `DESKTOP` · `TABLET` · `AGNOSTIC`

## Variant Options / 变体选项

`generate_variants` supports `variantOptions`:
- `count`: Number of variants (default: 4)
- `creativeRange`: `REFINE` (subtle) | `EXPLORE` (moderate) | `REIMAGINE` (dramatic)
- `aspects`: Specific aspects to vary

## Environment Variables / 环境变量

| Variable | Default | Description |
|----------|---------|-------------|
| `CDP_URL` | `http://127.0.0.1:18800` | Chrome CDP URL (Playwright mode only) |

## Prompt Tips / Prompt 技巧

```
Good: "A pricing page with 3 tier cards (Basic $9/mo, Pro $29/mo, Enterprise custom),
       monthly/yearly toggle, dark gradient header, CTA buttons, FAQ section below.
       Primary #0056D2, Inter font, minimal style like Stripe."

Bad:  "a pricing page"
```

- **Be specific / 描述具体**: Include layout, colors, content, number of elements
- **Reference real products / 参考真实产品**: "Like Notion's sidebar" or "Stripe's pricing layout"
- **Specify brand / 指定品牌**: Colors, fonts, dark/light theme
- **Include content / 包含内容**: Real text, prices, feature names — not lorem ipsum

## Project Structure / 项目结构

```
stitch-ui/
├── SKILL.md                    ← Agent entry point / AI 代理入口
├── README.md                   ← This file / 本文件
├── LICENSE                     ← MIT
├── package.json
├── references/
│   ├── mcp-setup.md            ← MCP setup guide (API Key + OAuth) / MCP 配置指南
│   └── playwright-mode.md      ← Playwright guide / Playwright 使用指南
└── scripts/
    └── stitch-generate.js      ← Browser automation script / 浏览器自动化脚本
```

## Requirements / 系统要求

**MCP mode (recommended):**
- API Key from Stitch Settings, OR Google Cloud project with gcloud CLI
- MCP-compatible client (Claude Code, Cursor, VSCode, Gemini CLI, Antigravity)

**Playwright mode (fallback):**
- Node.js >= 18
- Chrome browser
- `playwright-core` npm package
- Google account with Stitch access

## License / 许可证

[MIT](LICENSE) © CLOUD(HK)LIMITED

## Links / 相关链接

- [Google Stitch](https://stitch.withgoogle.com)
- [Stitch MCP Docs](https://stitch.withgoogle.com/docs/mcp/setup)
- [OpenClaw](https://github.com/openclaw/openclaw)
- [AgentSkills Docs](https://docs.openclaw.ai)
- [ClawHub Skills Marketplace](https://clawhub.com)
