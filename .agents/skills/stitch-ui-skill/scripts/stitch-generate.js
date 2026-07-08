#!/usr/bin/env node
/**
 * stitch-generate.js — Google Stitch UI 自动化生成工具
 * 
 * 用法:
 *   node stitch-generate.js --prompt "描述你要的界面" [--type app|web] [--output 输出目录]
 * 
 * 输出:
 *   <output>/code.html    — 完整 HTML+Tailwind 代码
 *   <output>/screen.png   — 设计截图
 *   <output>/DESIGN.md    — 设计文档
 * 
 * Requires: playwright-core (npm i -g playwright-core), Chrome with CDP enabled
 * 依赖: playwright-core, Chrome 浏览器需开启 CDP (远程调试)
 * 
 * Environment:
 *   CDP_URL — Chrome DevTools Protocol URL (default: http://127.0.0.1:18800)
 */

let chromium;
try {
  chromium = require('playwright-core').chromium;
} catch {
  try {
    chromium = require('playwright').chromium;
  } catch {
    console.error('❌ playwright-core or playwright required. Install: npm install -g playwright-core');
    process.exit(1);
  }
}
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:18800';
const STITCH_URL = 'https://stitch.withgoogle.com/?pli=1';

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = process.argv[i + 1];
      if (!next || next.startsWith('--')) { args[key] = true; }
      else { args[key] = next; i++; }
    }
  }
  return args;
}

async function getAppFrame(page) {
  const frames = page.frames();
  return frames.find(f => f.url().includes('app-companion')) || frames[1] || frames[0];
}

async function waitForGeneration(page, appFrame, timeoutMs = 180000) {
  const start = Date.now();
  console.log('⏳ 等待生成完成...');
  
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const state = await appFrame.evaluate(() => {
        const btns = document.querySelectorAll('button');
        let generating = false;
        let hasMore = false;
        btns.forEach(b => {
          const text = (b.textContent || '').trim().toLowerCase();
          const label = (b.getAttribute('aria-label') || '').toLowerCase();
          if (text.includes('generating') || text.includes('生成中')) generating = true;
          if (text === 'more' || text.includes('导出')) hasMore = true;
        });
        return { generating, hasMore };
      });
      
      if (!state.generating && state.hasMore) {
        console.log('✅ 生成完成！');
        return true;
      }
      
      const elapsed = Math.round((Date.now() - start) / 1000);
      process.stdout.write(`\r  已等待 ${elapsed}s...`);
    } catch (e) { /* frame reloading */ }
  }
  
  console.log('\n⏰ 等待超时');
  return false;
}

async function downloadResult(page, appFrame, outputDir) {
  // 点 More → 下载
  console.log('📦 下载生成结果...');
  
  const moreBtn = await appFrame.$('button:has-text("More")');
  if (!moreBtn) {
    console.log('⚠️ 找不到 More 按钮，尝试导出按钮...');
    const exportBtn = await appFrame.$('button:has-text("导出")');
    if (exportBtn) { await exportBtn.click(); await page.waitForTimeout(1500); }
    return false;
  }
  
  await moreBtn.click();
  await page.waitForTimeout(1500);
  
  const downloadItem = await appFrame.$('[role="menuitem"]:has-text("下载")');
  if (!downloadItem) {
    console.log('⚠️ 找不到下载选项');
    await page.keyboard.press('Escape');
    return false;
  }
  
  // 监听下载
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await downloadItem.click();
  
  const download = await downloadPromise;
  if (!download) {
    console.log('⚠️ 下载未触发');
    return false;
  }
  
  const zipPath = path.join(outputDir, 'stitch.zip');
  await download.saveAs(zipPath);
  console.log('  ✅ ZIP 下载成功:', zipPath);
  
  // 解压
  try {
    execSync(`cd "${outputDir}" && unzip -o stitch.zip`, { stdio: 'pipe' });
    console.log('  ✅ 解压完成');
    
    // 列出文件
    const files = fs.readdirSync(outputDir);
    files.forEach(f => {
      const stat = fs.statSync(path.join(outputDir, f));
      console.log(`  📄 ${f} (${Math.round(stat.size / 1024)}KB)`);
    });
    
    return true;
  } catch (e) {
    console.log('  ⚠️ 解压失败:', e.message);
    return false;
  }
}

async function getCode(page, appFrame) {
  // 备用方案：通过 More → 查看代码 获取
  console.log('📋 提取代码...');
  
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  const moreBtn = await appFrame.$('button:has-text("More")');
  if (!moreBtn) return null;
  
  await moreBtn.click();
  await page.waitForTimeout(1500);
  
  const viewCode = await appFrame.$('[role="menuitem"]:has-text("查看代码")');
  if (!viewCode) {
    await page.keyboard.press('Escape');
    return null;
  }
  
  await viewCode.click();
  await page.waitForTimeout(3000);
  
  const code = await appFrame.evaluate(() => {
    const all = document.querySelectorAll('*');
    let codeText = '';
    all.forEach(el => {
      const text = el.textContent || '';
      if (text.length > 200 && (text.includes('<!DOCTYPE') || text.includes('<html'))) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) {
          if (!codeText || text.length < codeText.length) {
            codeText = text;
          }
        }
      }
    });
    return codeText;
  });
  
  return code || null;
}

async function main() {
  const args = parseArgs();
  
  if (!args.prompt) {
    console.log(`
🎨 Google Stitch UI 自动化生成工具

用法:
  node stitch-generate.js --prompt "描述" [--type app|web] [--output 目录]

示例:
  node stitch-generate.js --prompt "eSIM pricing comparison page" --type web
  node stitch-generate.js --prompt "计数器 App" --type app --output ./my-ui

输出文件:
  code.html   — 完整 HTML+Tailwind 代码（可直接浏览器打开）
  screen.png  — 设计截图
  DESIGN.md   — 设计系统文档（颜色、字体、组件）
`);
    process.exit(0);
  }
  
  const prompt = args.prompt;
  const uiType = args.type || 'app';
  const outputDir = args.output || `/tmp/stitch-${Date.now()}`;
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log(`🎨 Stitch 自动化生成`);
  console.log(`  Prompt: ${prompt}`);
  console.log(`  类型: ${uiType}`);
  console.log(`  输出: ${outputDir}`);
  console.log('');
  
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  
  // 打开 Stitch
  console.log('🌐 打开 Stitch...');
  const page = await context.newPage();
  await page.goto(STITCH_URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(10000);
  
  const appFrame = await getAppFrame(page);
  if (!appFrame) {
    console.log('❌ 找不到 Stitch 应用');
    process.exit(1);
  }
  
  // 选择类型
  const typeText = uiType === 'web' ? 'Web' : '应用';
  console.log(`📱 选择类型: ${typeText}`);
  try {
    const typeBtn = await appFrame.$(`button:has-text("${typeText}")`);
    if (typeBtn) {
      await typeBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {}
  
  // 输入 prompt
  console.log('✏️ 输入 prompt...');
  const editableDiv = await appFrame.$('[contenteditable="true"]');
  if (!editableDiv) {
    console.log('❌ 找不到输入框');
    process.exit(1);
  }
  
  await editableDiv.click();
  await page.waitForTimeout(500);
  await editableDiv.evaluate(el => { el.textContent = ''; el.focus(); });
  await page.waitForTimeout(300);
  await editableDiv.type(prompt, { delay: 20 });
  await page.waitForTimeout(1000);
  
  // 生成
  console.log('🚀 开始生成...');
  const generateBtn = await appFrame.$('button[aria-label="生成设计"], [aria-label*="生成"]');
  if (generateBtn) {
    await generateBtn.click();
  } else {
    await editableDiv.press('Enter');
  }
  
  // 等待完成
  const success = await waitForGeneration(page, appFrame);
  if (!success) {
    console.log('⚠️ 生成可能未完成，仍尝试导出');
  }
  
  // 下载结果
  const downloaded = await downloadResult(page, appFrame, outputDir);
  
  // 如果下载失败，用代码提取方式
  if (!downloaded) {
    const code = await getCode(page, appFrame);
    if (code) {
      fs.writeFileSync(path.join(outputDir, 'code.html'), code);
      console.log('  💾 代码已提取保存');
    }
  }
  
  // 截图
  await page.screenshot({ path: path.join(outputDir, 'preview.png'), fullPage: true });
  
  console.log(`\n🎉 完成！输出目录: ${outputDir}`);
  console.log('  可以直接用浏览器打开 code.html 查看效果');
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
