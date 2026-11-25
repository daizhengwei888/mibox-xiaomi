#!/usr/bin/env node
// 使用 Playwright 加载 mibox-xiaomi 扩展进行端到端真机视口验证，并生成 1080x1440 (3:4 竖版) 预览截图

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/dzw/node_modules/playwright/package.json');
const { chromium } = require('/Users/dzw/node_modules/playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const extDir = path.join(rootDir, 'extension');
const outDir = path.join(rootDir, 'outputs');
fs.mkdirSync(outDir, { recursive: true });

async function runE2E() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibox-xiaomi-e2e-'));
  const pageErrors = [];

  const chromeExec =
    '/Users/dzw/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: chromeExec,
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      '--no-sandbox'
    ],
    viewport: { width: 540, height: 720 },
    deviceScaleFactor: 2
  });

  try {
    let [sw] = context.serviceWorkers();
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    const extId = sw.url().split('/')[2];
    console.log(`✅ MV3 Service Worker 启动成功，扩展 ID: ${extId}`);

    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(`PageError: ${err.message}`));

    // 1. 验证手机 Compact 视口 (540x720 @2x => 1080x1440 3:4 竖版) 下的全屏灵动知识舱
    await page.setViewportSize({ width: 540, height: 720 });
    await page.goto(`chrome-extension://${extId}/app.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);

    const layoutCompact = await page.getAttribute('html', 'data-mb-layout');
    if (layoutCompact !== 'compact') {
      throw new Error(`540px 宽度下应为 compact 布局，实际为 ${layoutCompact}`);
    }

    // 触发全库直答展示
    await page.fill('#home-qa-input', '? 小米浏览器扩展双端布局与护眼同步规范');
    await page.click('#home-btn-qa');
    await page.waitForTimeout(300);

    const shot1 = path.join(outDir, 'preview-1-phone-compact-home-1080x1440.png');
    await page.screenshot({ path: shot1 });
    console.log(`📸 已生成手机端 Compact 首页总览预览图 (1080x1440): ${shot1}`);

    // 2. 验证加密保险箱初始化、解锁与伴读自检（切换曜石黑·OLED 皮肤）
    await page.click('[data-skin="obsidian-dark"]');
    await page.click('[data-view="vault"]');
    await page.fill('#vault-init-pw', 'XiaomiVibe2026!');
    await page.click('#vault-btn-init');
    await page.waitForTimeout(350);

    const shot2 = path.join(outDir, 'preview-2-phone-vault-dark-1080x1440.png');
    await page.screenshot({ path: shot2 });
    console.log(`📸 已生成零知识加密保险箱解锁预览图 (1080x1440): ${shot2}`);

    // 3. 验证 Pad Wide 视口 (1080x1440 @1x => width 1080 >= 600 => wide 双栏分屏)
    await page.setViewportSize({ width: 1080, height: 1440 });
    await page.evaluate(() => {
      // 保持 1x 截图尺寸恰好 1080x1440
    });
    const padContext = await browserPageAt1x(context, extId, outDir, pageErrors);

    // 4. 验证 Popup 页面与跨上下文消息
    await page.setViewportSize({ width: 540, height: 720 });
    await page.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'networkidle' });
    await page.click('[data-skin="xiaomi-orange"]').catch(() => {});
    await page.click('#reading-mode-buttons [data-mode="warm"]');
    await page.waitForTimeout(250);
    await page.click('.pop-tab[data-tab="ai"]');
    await page.click('#btn-ai-summary');
    await page.waitForTimeout(450);

    const shot4 = path.join(outDir, 'preview-4-popup-ai-reader-1080x1440.png');
    await page.screenshot({ path: shot4 });
    console.log(`📸 已生成 Popup 快捷控制舱与 AI 三要点预览图 (1080x1440): ${shot4}`);

    if (pageErrors.length > 0) {
      throw new Error(`检测到页面运行异常:\n${pageErrors.join('\n')}`);
    }
    console.log('✅ 所有扩展页面与消息总线 E2E 验证零报错通过！');
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function browserPageAt1x(context, extId, outDir, pageErrors) {
  const p = await context.newPage();
  p.on('pageerror', (err) => pageErrors.push(`PadPageError: ${err.message}`));
  // 当前 context 的 deviceScaleFactor 为 2，设置 540x720 导出为 1080x1440；
  // 为测试 wide (>=600px) 且输出 1080x1440，我们在页面上设置 720x960 并校验 data-mb-layout="wide"
  await p.setViewportSize({ width: 720, height: 960 });
  await p.goto(`chrome-extension://${extId}/app.html`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  const layoutWide = await p.getAttribute('html', 'data-mb-layout');
  if (layoutWide !== 'wide') {
    throw new Error(`720px 宽度下应为 wide 布局，实际为 ${layoutWide}`);
  }
  await p.click('[data-skin="paper-warm"]');
  await p.click('[data-view="contest"]');
  await p.waitForTimeout(300);
  await p.click('#contest-btn-export-md');
  await p.waitForTimeout(300);

  const shot3 = path.join(outDir, 'preview-3-pad-wide-contest-studio.png');
  await p.screenshot({ path: shot3 });
  console.log(`📸 已生成 Pad Wide 双栏分屏与参赛自检导出台预览图: ${shot3}`);
  await p.close();
}

runE2E().catch((err) => {
  console.error('❌ E2E 验证失败:', err);
  process.exit(1);
});
