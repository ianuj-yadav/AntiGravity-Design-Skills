# Stitch MCP Setup / MCP 配置指南

## Overview / 概述

Google Stitch provides an official Remote MCP server at `https://stitch.googleapis.com/mcp`.
Two authentication methods: **API Key** (recommended) and **OAuth**.

Google Stitch 提供官方 Remote MCP 服务器。两种认证方式：**API Key**（推荐）和 **OAuth**。

---

## Method 1: API Key (Recommended) / API Key 方式（推荐）

### 1. Generate API Key / 生成 API Key

1. Go to [Stitch Settings](https://stitch.withgoogle.com) page
2. Scroll to **API Keys** section
3. Click **Create API Key**
4. Copy and save securely — never commit to public repos

前往 Stitch 设置页面 → API Keys → 创建 API Key → 安全保存。

### 2. Configure MCP Client / 配置 MCP 客户端

#### Claude Code
```bash
claude mcp add stitch \
  --transport http https://stitch.googleapis.com/mcp \
  --header "X-Goog-Api-Key: YOUR_KEY" \
  -s user
# -s user: saves to ~/.claude.json (global)
# -s project: saves to ./.mcp.json (project-level)
```

#### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "stitch": {
      "url": "https://stitch.googleapis.com/mcp",
      "headers": {
        "X-Goog-Api-Key": "YOUR_KEY"
      }
    }
  }
}
```

#### VSCode
Open Command Palette → "MCP: Add Server" → HTTP → `https://stitch.googleapis.com/mcp` → name "stitch".
Then edit `mcp.json`:
```json
{
  "servers": {
    "stitch": {
      "url": "https://stitch.googleapis.com/mcp",
      "type": "http",
      "headers": {
        "Accept": "application/json",
        "X-Goog-Api-Key": "YOUR_KEY"
      }
    }
  }
}
```

#### Antigravity
Agent Panel → three dots → MCP Servers → Manage → View raw config:
```json
{
  "mcpServers": {
    "stitch": {
      "serverUrl": "https://stitch.googleapis.com/mcp",
      "headers": {
        "X-Goog-Api-Key": "YOUR_KEY"
      }
    }
  }
}
```

#### Gemini CLI
```bash
gemini extensions install https://github.com/gemini-cli-extensions/stitch
```

### 3. Verify / 验证

Ask your AI agent: "List my Stitch projects" — it should call `list_projects` and return results.

让 AI 助手执行 "列出我的 Stitch 项目" 来验证连接。

---

## Method 2: OAuth (Alternative) / OAuth 方式（备选）

Use OAuth when: your environment blocks persistent secrets, you need session-based access, or your tool requires a "Sign In" flow.

适用场景：环境限制存储密钥、需要会话级访问、或工具需要登录流程。

### 1. Install gcloud CLI / 安装 gcloud

```bash
# macOS
brew install --cask google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Verify / 验证
gcloud --version
```

### 2. Authenticate (Double-Layer) / 认证（双层）

```bash
# User login (opens browser) / 用户登录
gcloud auth login

# Application Default Credentials / 应用默认凭据
gcloud auth application-default login
```

### 3. Configure Project & Permissions / 配置项目和权限

```bash
PROJECT_ID="YOUR_PROJECT_ID"

gcloud config set project "$PROJECT_ID"

# Enable Stitch API / 启用 Stitch API
gcloud beta services mcp enable stitch.googleapis.com --project="$PROJECT_ID"

# Grant permissions / 授权
USER_EMAIL=$(gcloud config get-value account)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="user:$USER_EMAIL" \
  --role="roles/serviceusage.serviceUsageConsumer" \
  --condition=None
```

### 4. Generate Access Token / 生成访问令牌

```bash
TOKEN=$(gcloud auth application-default print-access-token)
echo "Token: $TOKEN"
```

> Access tokens expire after ~1 hour. Re-run this command when expired.
> 访问令牌约 1 小时过期，过期后重新运行此命令。

### 5. Configure MCP Client (OAuth) / 配置 MCP 客户端

#### Claude Code
```bash
claude mcp add stitch \
  --transport http https://stitch.googleapis.com/mcp \
  --header "Authorization: Bearer YOUR_TOKEN" \
  --header "X-Goog-User-Project: YOUR_PROJECT_ID" \
  -s user
```

#### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "stitch": {
      "url": "https://stitch.googleapis.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN",
        "X-Goog-User-Project": "YOUR_PROJECT_ID"
      }
    }
  }
}
```

#### VSCode
```json
{
  "servers": {
    "stitch": {
      "url": "https://stitch.googleapis.com/mcp",
      "type": "http",
      "headers": {
        "Accept": "application/json",
        "Authorization": "Bearer YOUR_TOKEN",
        "X-Goog-User-Project": "YOUR_PROJECT_ID"
      }
    }
  }
}
```

---

## Available Tools (12) / 可用工具

| Tool | Description / 描述 |
|------|-------------------|
| `create_project` | Create new project / 创建项目 |
| `get_project` | Get project details / 获取项目详情 |
| `list_projects` | List all projects / 列出所有项目 |
| `list_screens` | List screens in project / 列出页面 |
| `get_screen` | Get screen details + HTML code / 获取页面代码 |
| `generate_screen_from_text` | Generate UI from prompt / 从描述生成 UI |
| `edit_screens` | Edit existing screens / 编辑页面 |
| `generate_variants` | Generate design variants / 生成设计变体 |
| `create_design_system` | Create design system / 创建设计系统 |
| `update_design_system` | Update design system / 更新设计系统 |
| `list_design_systems` | List design systems / 列出设计系统 |
| `apply_design_system` | Apply design system to screens / 应用设计系统 |

## Models / 模型

| Model | Speed | Quality | Notes |
|-------|-------|---------|-------|
| `GEMINI_3_FLASH` | Fast | Good | Default / 默认推荐 |
| `GEMINI_3_1_PRO` | Slower | Best | Complex UI / 复杂界面 |

## Troubleshooting / 故障排查

**"Unauthenticated" or 401 error**
→ API Key: verify key is correct and not expired. Regenerate from Stitch Settings.
→ OAuth: token expired. Re-run `gcloud auth application-default print-access-token`.

**"Permission denied" or 403 error**
→ Ensure Stitch API is enabled: `gcloud beta services mcp enable stitch.googleapis.com`
→ Ensure `serviceusage.serviceUsageConsumer` role is granted.

**"Project not found"**
→ Check project ID. For OAuth: `gcloud config set project YOUR_PROJECT_ID`.
→ For API Key: project is determined by the key itself.

**MCP client not connecting**
→ Verify URL: `https://stitch.googleapis.com/mcp`
→ Ensure transport is `http` (not `sse` or `stdio`)
→ Check header format matches your client's config schema.
