#!/usr/bin/env node
// 小米浏览器 Vibe Coding 大赛官方 ZIP 校验器 (rw/ow) + mibrowser-extension-dev (SKILL.md v4-fixed) 全量合规审计脚本

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const extDir = path.join(rootDir, 'extension');
const manifestPath = path.join(extDir, 'manifest.json');

// 1. 复刻大赛官网 index-31d3ca7d.js 中的 ow() 与 rw() ZIP 校验逻辑
const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

function ow(entryPath) {
  return Boolean(
    entryPath.startsWith('/') ||
    /^[A-Za-z]:/.test(entryPath) ||
    entryPath.includes('\\') ||
    entryPath.split('/').includes('..')
  );
}

function rw(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength < 22) {
    throw new Error('文件不是有效的 ZIP 格式');
  }
  const view = new DataView(arrayBuffer);
  let eocdOffset = -1;
  const minOffset = Math.max(0, arrayBuffer.byteLength - 22 - 65535);
  for (let i = arrayBuffer.byteLength - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('文件不是有效的 ZIP 格式');
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);
  if (centralDirOffset + 46 > arrayBuffer.byteLength) throw new Error('ZIP 文件已损坏');

  const decoder = new TextDecoder('utf-8');
  let ptr = centralDirOffset;
  let fileCount = 0;
  let totalUncompressed = 0;
  let hasManifest = false;
  let hasRootManifest = false;
  let badPath = '';
  const entries = [];

  for (let i = 0; i < entryCount; i++) {
    if (ptr + 46 > arrayBuffer.byteLength || view.getUint32(ptr, true) !== CEN_SIG) {
      throw new Error('ZIP 文件已损坏');
    }
    const uncompressedSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    if (ptr + 46 + nameLen + extraLen + commentLen > arrayBuffer.byteLength) {
      throw new Error('ZIP 文件已损坏');
    }
    const name = decoder.decode(new Uint8Array(arrayBuffer, ptr + 46, nameLen));
    entries.push(name);
    if (!name.endsWith('/')) fileCount++;
    if (!badPath && ow(name)) badPath = name;
    if (name.split(/[\\/]/).pop() === 'manifest.json') hasManifest = true;
    if (name === 'manifest.json') hasRootManifest = true;
    totalUncompressed += uncompressedSize;
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return {
    entryCount,
    fileCount,
    totalUncompressed,
    hasManifest,
    hasRootManifest,
    badPath,
    entries
  };
}

function collectFiles(dir, extFilter) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full, extFilter));
    else if (!extFilter || full.endsWith(extFilter)) out.push(full);
  }
  return out;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const zipPath = path.join(rootDir, 'dist', `mibox-xiaomi-${manifest.version}.zip`);

if (!fs.existsSync(zipPath)) {
  console.error(`❌ 未找到打包产物: ${zipPath}`);
  process.exit(1);
}

const zipBuf = fs.readFileSync(zipPath);
const zipAb = zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.byteLength);
const zipMeta = rw(zipAb);
const sha256 = crypto.createHash('sha256').update(zipBuf).digest('hex');

const errors = [];

// 校验 1：大赛平台 ZIP 硬性限制
if (zipBuf.length > 20971520) errors.push(`ZIP 超过 20MB: ${zipBuf.length}`);
if (zipMeta.totalUncompressed > 52428800) errors.push(`解压后超过 50MB: ${zipMeta.totalUncompressed}`);
if (zipMeta.fileCount > 2000) errors.push(`文件数超过 2000: ${zipMeta.fileCount}`);
if (zipMeta.badPath) errors.push(`路径不合规: ${zipMeta.badPath}`);
if (!zipMeta.hasManifest || !zipMeta.hasRootManifest) {
  errors.push('manifest.json 必须位于 ZIP 包根目录');
}

// 校验 2：manifest.json 规范 (SKILL.md §1/§2/§4/§6)
if (manifest.manifest_version !== 3) errors.push('manifest_version 必须为 3');
const nameLen = [...String(manifest.name || '')].length;
if (nameLen < 2 || nameLen > 16) errors.push(`扩展程序名称须为 2-16 字，当前 ${nameLen} 字`);
const descLen = [...String(manifest.description || '')].length;
if (descLen < 1 || descLen > 1000) errors.push(`扩展程序描述须为 1-1000 字，当前 ${descLen} 字`);
if (manifest.key) errors.push('SKILL.md §6 要求不携带签名 key 字段');
if (manifest.oauth2) errors.push('SKILL.md §4 不采用 identity/oauth2');
if (manifest.omnibox) errors.push('SKILL.md §4 不采用 omnibox');

const FORBIDDEN_PERMS = [
  'bookmarks',
  'history',
  'tabGroups',
  'sessions',
  'notifications',
  'identity',
  'proxy',
  'debugger',
  'desktopCapture',
  'tabCapture',
  'contextMenus',
  'omnibox',
  'privacy',
  'webRequestBlocking',
  'webRequestAuthProvider'
];

const declaredPerms = [
  ...(manifest.permissions || []),
  ...(manifest.optional_permissions || [])
];
for (const p of declaredPerms) {
  if (FORBIDDEN_PERMS.includes(p)) {
    errors.push(`manifest 声明了 SKILL.md §4 明确不采用的权限: ${p}`);
  }
}

// 校验图标 16 / 48 / 128
for (const size of ['16', '48', '128']) {
  const iconRel = manifest.icons?.[size];
  const actIconRel = manifest.action?.default_icon?.[size];
  if (!iconRel || !fs.existsSync(path.join(extDir, iconRel))) {
    errors.push(`缺少 manifest.icons[${size}] 图标文件`);
  }
  if (!actIconRel || !fs.existsSync(path.join(extDir, actIconRel))) {
    errors.push(`缺少 action.default_icon[${size}] 图标文件`);
  }
}

// 校验 3：JS 源码不调用禁用 API、不含 eval
const FORBIDDEN_APIS = [
  'chrome.bookmarks',
  'chrome.history',
  'chrome.contextMenus',
  'chrome.omnibox',
  'chrome.identity',
  'chrome.proxy',
  'chrome.tabs.remove',
  'chrome.tabs.highlight',
  'chrome.action.setTitle',
  'chrome.action.setBadgeBackgroundColor',
  'chrome.action.getBadgeText'
];

const jsFiles = collectFiles(extDir, '.js');
for (const file of jsFiles) {
  const code = fs.readFileSync(file, 'utf8');
  // 去掉单行注释后再检查 API 调用
  const codeNoComments = code.replace(/\/\/.*$/gm, '');
  for (const api of FORBIDDEN_APIS) {
    if (codeNoComments.includes(api)) {
      errors.push(`${path.relative(rootDir, file)} 包含禁用 API 调用: ${api}`);
    }
  }
  if (/\beval\s*\(/.test(codeNoComments)) {
    errors.push(`${path.relative(rootDir, file)} 包含 eval()`);
  }
}

// 校验 4：HTML 不含 inline onclick 或远程脚本
const htmlFiles = collectFiles(extDir, '.html');
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  if (/\bonclick\s*=/i.test(html)) {
    errors.push(`${path.relative(rootDir, file)} 包含 inline onclick`);
  }
  if (/<script[^>]+src=["']https?:\/\//i.test(html)) {
    errors.push(`${path.relative(rootDir, file)} 包含远程可执行 JS`);
  }
}

if (errors.length > 0) {
  console.error('❌ 小米浏览器参赛合规校验未通过：');
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log('================================================================');
console.log('✅ 小米浏览器 Vibe Coding 大赛扩展规范 (SKILL.md v4-fixed) 校验通过');
console.log('================================================================');
console.log(`📦 产物路径      : ${zipPath}`);
console.log(`🏷️ 扩展名称      : ${manifest.name} (${nameLen} 字，符合 2-16 字要求)`);
console.log(`📝 扩展描述长度  : ${descLen} 字 (符合 1-1000 字要求)`);
console.log(`📊 ZIP 压缩包大小: ${(zipBuf.length / 1024).toFixed(2)} KB (上限 20,480 KB)`);
console.log(`📂 解压后总大小  : ${(zipMeta.totalUncompressed / 1024).toFixed(2)} KB (上限 51,200 KB)`);
console.log(`📄 包内文件数量  : ${zipMeta.fileCount} 个 (上限 2,000 个，根目录含 manifest.json)`);
console.log(`🔐 SHA-256       : ${sha256}`);
console.log('================================================================');
