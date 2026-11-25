#!/usr/bin/env node
// 启动本地真实文章页服务，通过 Playwright 加载 mibox-xiaomi 扩展截取 6 大真实使用场景图 (1080x1440, 3:4 竖版, <=2MB)

import http from 'node:http';
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

const ARTICLE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Xiaomi MiMo v2.6 与移动端浏览器 AI 伴读架构深度解析 — 小米开发者技术专栏</title>
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "MiSans", "PingFang SC", sans-serif;
      background: #ffffff;
      color: #1e293b;
      line-height: 1.8;
    }
    .top-nav {
      padding: 12px 18px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.25);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 700;
      color: #ff6900;
    }
    article {
      max-width: 680px;
      margin: 0 auto;
      padding: 20px 18px 140px;
    }
    .meta {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 14px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    h1 {
      font-size: 21px;
      line-height: 1.4;
      margin: 0 0 12px;
      font-weight: 800;
    }
    h2 {
      font-size: 16.5px;
      margin: 20px 0 8px;
      font-weight: 700;
    }
    p {
      margin: 10px 0;
      font-size: 15px;
    }
    blockquote {
      margin: 14px 0;
      padding: 10px 14px;
      border-left: 4px solid #ff6900;
      background: rgba(255, 105, 0, 0.07);
      border-radius: 0 10px 10px 0;
      font-size: 14px;
    }
    .highlight-target {
      background: rgba(255, 105, 0, 0.18);
      border-bottom: 2px solid #ff6900;
      padding: 2px 0;
    }
    pre {
      padding: 12px;
      border-radius: 10px;
      background: #f1f5f9;
      font-size: 12.5px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <div class="top-nav">
    <span>📱 小米浏览器 · 深度技术专栏</span>
    <span>Xiaomi MiMo × Vibe Coding</span>
  </div>
  <article class="article-content">
    <h1>Xiaomi MiMo v2.6 与移动端浏览器 AI 伴读架构深度解析</h1>
    <div class="meta">
      <span>作者：小米浏览器生态开发者</span>
      <span>发布于 2026-11-25</span>
      <span>分类：AI与大模型 / Manifest V3</span>
    </div>
    <p>首先，在手机与平板（Pad）上使用移动浏览器查阅长文、学术资料与技术文档时，用户长期面临三大核心痛点：移动端缺乏桌面鼠标右键菜单与物理快捷键，划词摘录和查资料需要频繁切换应用；夜间浏览不同网站时背景强光刺眼、冗余横幅大图耗流；零散网页收藏、阅读笔记与 API 密钥分散在多处，难以统一检索。</p>
    <blockquote id="quote-para">
      <span class="highlight-target" id="sel-target">核心结论：通过 Manifest V3 内容脚本注入轻量级 Shadow DOM 触控灵动胶囊与长按划词 AI 浮条，结合 Xiaomi MiMo 流式推理网关与 storage.onChanged 跨标签页状态总线，可在不离开当前阅读页的前提下完成「划词解读、闪念归档、四档护眼同步与全库问答」闭环。</span>
    </blockquote>
    <h2>一、双端自适应视口与跨标签护眼同步</h2>
    <p>其次，面对折叠屏手机、普通竖屏手机与小米平板（Pad）分屏模式的多样化视口，扩展不应依赖 User-Agent 猜测设备类型，而应直接测量容器 CSS 像素宽度（clientWidth >= 600px 切换 wide 双栏分屏，小于 600px 采用 compact 底部拇指导航与底部伴读抽屉）。</p>
    <pre><code>const pageWidth = document.documentElement.clientWidth || innerWidth;
const layout = pageWidth >= 600 ? "wide" : "compact";</code></pre>
    <h2>二、WebCrypto 零知识加密与双模导出</h2>
    <p>因此，在本地数据安全方面，采用浏览器原生 SubtleCrypto 执行 210,000 次 PBKDF2-SHA256 密钥派生与 AES-256-GCM 认证加密，配合 64 位恢复密钥与 30 秒剪贴板自动清空机制，可确保用户私密凭据 100% 留存在本机存储中。</p>
  </article>
</body>
</html>`;

async function captureAllScenarios() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(ARTICLE_HTML);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const articleUrl = `http://127.0.0.1:${port}/xiaomi-article.html`;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibox-xiaomi-scenarios-'));
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
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extId = sw.url().split('/')[2];

    const page = await context.newPage();

    // 场景 1：真实网页阅读 + 手指长按划词弹出 AI 浮条 + 右下角贴边灵动胶囊 + 存入笔记提示
    await page.setViewportSize({ width: 540, height: 720 });
    await page.goto(articleUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // 模拟在网页上选中核心段落并唤出划词 AI 浮条与顶部 Toast
    await page.evaluate(() => {
      const target = document.getElementById('sel-target');
      if (target) {
        const range = document.createRange();
        range.selectNodeContents(target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.waitForTimeout(250);

    // 点击「存笔记」以展示顶部 Toast，同时保持划词浮条可见供截图展示完整交互
    await page.evaluate(() => {
      const host = document.getElementById('mibox-xiaomi-touch-host');
      const sr = host?.shadowRoot;
      if (!sr) return;
      const clipBtn = sr.querySelector('[data-act="clip"]');
      if (clipBtn) clipBtn.click();
      const selBar = sr.getElementById('mb-sel-bar');
      if (selBar) selBar.classList.add('visible');
    });
    await page.waitForTimeout(300);

    const s1 = path.join(outDir, 'scenario-1-webpage-touch-selection-bar-1080x1440.png');
    await page.screenshot({ path: s1 });
    console.log(`📸 场景 1（网页长按划词 AI 浮条与灵动胶囊）: ${s1}`);

    // 场景 2：点击网页右下角灵动胶囊 -> 唤出页内伴读底部抽屉 + 暖纸护眼模式实时同步 + AI 提炼本页三要点
    await page.evaluate(() => {
      const host = document.getElementById('mibox-xiaomi-touch-host');
      const sr = host?.shadowRoot;
      if (!sr) return;
      sr.getElementById('mb-sel-bar')?.classList.remove('visible');
      sr.getElementById('mb-capsule')?.click();
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const host = document.getElementById('mibox-xiaomi-touch-host');
      const sr = host?.shadowRoot;
      if (!sr) return;
      sr.querySelector('#mb-mode-row [data-mode="warm"]')?.click();
      sr.getElementById('mb-act-summary')?.click();
    });
    await page.waitForTimeout(550);

    const s2 = path.join(outDir, 'scenario-2-inpage-drawer-warm-ai-summary-1080x1440.png');
    await page.screenshot({ path: s2 });
    console.log(`📸 场景 2（页内伴读抽屉 + 暖纸护眼 + AI 三要点提炼）: ${s2}`);

    // 场景 3：网页深色夜读模式（OLED Dark）+ 页内全库 `?` 检索直答
    await page.evaluate(() => {
      const host = document.getElementById('mibox-xiaomi-touch-host');
      const sr = host?.shadowRoot;
      if (!sr) return;
      sr.querySelector('#mb-mode-row [data-mode="dark"]')?.click();
      const input = sr.getElementById('mb-qa-input');
      if (input) input.value = '? 小米浏览器扩展双端布局与护眼同步规范';
      sr.getElementById('mb-qa-btn')?.click();
    });
    await page.waitForTimeout(450);

    const s3 = path.join(outDir, 'scenario-3-inpage-dark-mode-kb-qa-1080x1440.png');
    await page.screenshot({ path: s3 });
    console.log(`📸 场景 3（深色夜读 OLED 护眼 + 页内全库检索直答）: ${s3}`);

    // 场景 4：手机端 (compact < 600px) 全屏灵动知识舱首页总览 + 五套高定皮肤 + 星标收藏
    await page.goto(`chrome-extension://${extId}/app.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.click('[data-skin="xiaomi-orange"]');
    await page.fill('#home-qa-input', '? 小米浏览器扩展支持哪些核心能力');
    await page.click('#home-btn-qa');
    await page.waitForTimeout(350);

    const s4 = path.join(outDir, 'scenario-4-phone-workspace-home-1080x1440.png');
    await page.screenshot({ path: s4 });
    console.log(`📸 场景 4（手机端全屏知识舱总览与全库问答）: ${s4}`);

    // 场景 5：零知识加密保险箱（曜石黑 OLED 皮肤 + PBKDF2 21万次 & AES-256-GCM 解锁与恢复密钥）
    await page.click('[data-skin="obsidian-dark"]');
    await page.click('[data-view="vault"]');
    await page.fill('#vault-init-pw', 'XiaomiVibe2026!');
    await page.click('#vault-btn-init');
    await page.waitForTimeout(350);

    const s5 = path.join(outDir, 'scenario-5-vault-aes256-dark-1080x1440.png');
    await page.screenshot({ path: s5 });
    console.log(`📸 场景 5（AES-256-GCM 零知识隐私保险箱与恢复密钥）: ${s5}`);

    // 场景 6：小米平板 Pad 端 (wide >= 600px) 双栏分屏工作台 + 大赛 7 项合规自检与双端导出（输出精确缩放到 1080x1440）
    const padPage = await context.newPage();
    await padPage.setViewportSize({ width: 720, height: 960 });
    await padPage.goto(`chrome-extension://${extId}/app.html`, { waitUntil: 'networkidle' });
    await padPage.waitForTimeout(300);
    await padPage.click('[data-skin="paper-warm"]');
    await padPage.click('[data-view="contest"]');
    await padPage.waitForTimeout(250);
    await padPage.click('#contest-btn-export-md');
    await padPage.waitForTimeout(300);

    const s6Raw = path.join(outDir, 'scenario-6-pad-wide-raw.png');
    const s6 = path.join(outDir, 'scenario-6-pad-wide-studio-1080x1440.png');
    await padPage.screenshot({ path: s6Raw });
    await padPage.close();

    // 保持预置 preview-1..4 同步更新
    fs.copyFileSync(s1, path.join(outDir, 'preview-1-phone-compact-home-1080x1440.png'));
    fs.copyFileSync(s5, path.join(outDir, 'preview-2-phone-vault-dark-1080x1440.png'));
    fs.copyFileSync(s2, path.join(outDir, 'preview-4-popup-ai-reader-1080x1440.png'));
    fs.copyFileSync(s6Raw, s6);
    fs.rmSync(s6Raw, { force: true });
    console.log(`📸 场景 6（小米 Pad 宽屏双栏分屏与参赛自检导出台）: ${s6}`);
  } finally {
    await context.close();
    server.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

captureAllScenarios().catch((err) => {
  console.error('❌ 场景截图生成失败:', err);
  process.exit(1);
});
