// 谜盒·灵动知识舱 (mibox-xiaomi) 核心引擎单元测试

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createVaultHeader,
  unlockVaultWithPassword,
  resetPasswordWithRecoveryKey,
  encryptVaultItem,
  decryptVaultItem
} from '../extension/src/shared/crypto.js';
import {
  inferBookmarkIntelligence,
  runOfflinePageAnalysis,
  answerFromKnowledgeBase,
  runSmartAiTask
} from '../extension/src/shared/ai-engine.js';
import {
  measureViewport,
  SKINS,
  READING_MODES
} from '../extension/src/shared/viewport.js';
import {
  buildContestSeedData,
  exportKnowledgeBundle
} from '../extension/src/shared/storage-repo.js';

test('1. WebCrypto PBKDF2 + AES-256-GCM 零知识保险箱加解密与恢复密钥重置', async () => {
  const masterPw = 'XiaomiVibe2026!';
  const created = await createVaultHeader(masterPw);
  assert.ok(created.header);
  assert.ok(created.masterKeyBase64);
  assert.match(created.recoveryKeyText, /^[0-9A-F]{8}(-[0-9A-F]{8}){7}$/);

  const unlockedKey = await unlockVaultWithPassword(created.header, masterPw);
  assert.equal(unlockedKey, created.masterKeyBase64);

  await assert.rejects(
    () => unlockVaultWithPassword(created.header, 'WrongPassword123'),
    /主密码错误/
  );

  const encItem = await encryptVaultItem(unlockedKey, 'item-01', {
    title: 'Xiaomi MiMo Key',
    secret: 'sk-mimo-secret-value'
  });
  assert.ok(encItem.iv && encItem.ct);

  const decItem = await decryptVaultItem(unlockedKey, encItem);
  assert.equal(decItem.title, 'Xiaomi MiMo Key');
  assert.equal(decItem.secret, 'sk-mimo-secret-value');

  // 使用恢复密钥重置主密码后仍可解密既有记录
  const reset = await resetPasswordWithRecoveryKey(
    created.header,
    created.recoveryKeyText,
    'NewMasterPass2026!'
  );
  const decAfterReset = await decryptVaultItem(reset.masterKeyBase64, encItem);
  assert.equal(decAfterReset.secret, 'sk-mimo-secret-value');
});

test('2. 零配置本地智能引擎：网页分类、一句话简介、三要点提炼与全库问答', async () => {
  const intel = inferBookmarkIntelligence({
    title: '小米浏览器 Vibe Coding 大赛扩展开发指南',
    url: 'https://vibe-coding.browser.miui.com/rules',
    text: '小米浏览器与 Xiaomi MiMo 联合举办扩展程序大赛，支持手机与 Pad 双端安装 Manifest V3 扩展。'
  });
  assert.equal(intel.group, '小米与硬件');
  assert.ok(intel.tags.includes('小米生态'));
  assert.ok(intel.brief.length >= 10);

  const summary = runOfflinePageAnalysis({
    mode: 'summary',
    title: 'Xiaomi MiMo 大模型技术文档',
    url: 'https://mimo.mi.com/docs',
    text: '首先，Xiaomi MiMo 提供高速流式推理能力。其次，结合小米浏览器扩展可实现划词精读与全库问答。因此开发者可以快速构建移动端 AI 伴读工具。'
  });
  assert.match(summary, /核心要点提炼/);

  const seed = buildContestSeedData();
  const qa = answerFromKnowledgeBase('? 小米浏览器双端扩展怎么适配布局', seed);
  assert.ok(qa.matches.length > 0);
  assert.match(qa.answer, /谜盒全库检索直答/);

  const chunks = [];
  const taskRes = await runSmartAiTask({
    aiConfig: { apiKey: '' },
    taskMode: 'summary',
    pageContext: {
      title: '测试文章',
      url: 'https://example.com',
      text: '这是一篇关于小米浏览器扩展开发与护眼阅读模式跨标签同步的测试文章。'
    },
    onChunk: (txt) => chunks.push(txt)
  });
  assert.equal(taskRes.ok, true);
  assert.equal(taskRes.engine, 'local-zero-config');
  assert.ok(chunks.length >= 1);
});

test('3. 视口测量与 Pad 端无 downloads API 时的自动降级导出', async () => {
  const vp = measureViewport();
  assert.equal(vp.layout, 'compact');
  assert.equal(SKINS.length, 5);
  assert.equal(READING_MODES.length, 4);

  const exported = await exportKnowledgeBundle('markdown');
  assert.equal(exported.ok, true);
  assert.equal(exported.downloaded, false);
  assert.match(exported.text, /谜盒·划词笔记 导出归档/);
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeUrl } from '../extension/src/shared/viewport.js';

test('4. safeUrl 只放行 http/https 与扩展内相对链接', () => {
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeUrl('http://example.com'), 'http://example.com');
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('data:text/html,<script>1</script>'), '#');
  assert.equal(safeUrl(''), '#');
  assert.equal(safeUrl('panel.html'), 'panel.html');
});

test('5. manifest 引用的文件都存在且版本与打包名一致', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
  assert.equal(manifest.version, '1.3.0');
  const refs = [
    manifest.action.default_popup,
    manifest.side_panel.default_path,
    manifest.options_page,
    manifest.background.service_worker,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])])
  ];
  for (const r of refs) assert.ok(fs.existsSync(path.join(root, 'extension', r)), `missing ${r}`);
  assert.equal([...manifest.name].length >= 2 && [...manifest.name].length <= 16, true);
});

test('6. 全局正则重复调用结果一致（lastIndex 回归）', () => {
  const re = /\d+/g;
  const run = () => { re.lastIndex = 0; return [...'a1 b22 c333'.matchAll(re)].map((m) => m[0]); };
  assert.deepEqual(run(), ['1', '22', '333']);
  assert.deepEqual(run(), ['1', '22', '333']);
});
