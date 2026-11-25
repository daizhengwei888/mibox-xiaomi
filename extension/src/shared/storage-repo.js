// 谜盒·小米版 统一本地存储仓库（基于 chrome.storage.local，遵守 SKILL.md §2/§3 存储与双端导出规范）

import { randomId } from './crypto.js';
import { inferBookmarkIntelligence } from './ai-engine.js';

export const STORAGE_KEYS = {
  SETTINGS: 'mb_settings_v1',
  READING: 'mb_reading_v1',
  BOOKMARKS: 'mb_bookmarks_v1',
  NOTES: 'mb_notes_v1',
  VAULT_HEADER: 'mb_vault_header_v1',
  VAULT_ITEMS: 'mb_vault_items_v1',
  VAULT_SESSION: 'mb_vault_session_v1',
  DNR_RULES: 'mb_dnr_rules_v1'
};

export const DEFAULT_SETTINGS = {
  skin: 'xiaomi-orange',
  touchCapsuleEnabled: true,
  selectionBarEnabled: true,
  capsulePositionY: 78,
  ai: {
    presetId: 'xiaomi-mimo',
    protocol: 'openai',
    baseUrl: 'https://api.mimo.mi.com/v1',
    model: 'mimo-v2.6',
    apiKey: ''
  },
  vaultAutoLockMinutes: 15,
  initializedSeed: false
};

export const DEFAULT_READING = {
  mode: 'off',          // 'off' | 'warm' | 'dark' | 'eink' （全局阅读主题，对所有授权网站生效）
  fontScale: 100,       // 90 | 100 | 115 | 130
  lineHeight: 'relaxed',
  showReadingBadge: true
};

export const DEFAULT_DNR = {
  enabled: false,
  blockedDomains: ['doubleclick.net', 'googlesyndication.com'],
  blockAdImagesPath: true
};

/**
 * 参赛开箱演示种子数据：首次安装在小米浏览器打开即呈现饱满的收藏与 Markdown 笔记
 */
export function buildContestSeedData() {
  const now = Date.now();
  const bookmarks = [
    {
      id: 'bm-xiaomi-vibe',
      title: '小米浏览器 Vibe Coding 大赛 · 创意扩展程序赛道',
      url: 'https://vibe-coding.browser.miui.com/rules',
      domain: 'vibe-coding.browser.miui.com',
      group: '小米与硬件',
      tags: ['小米生态', 'VibeCoding', '浏览器扩展'],
      brief: '小米浏览器 × Xiaomi MiMo 联合举办的 AI 创作大赛，支持在手机与 Pad 端导入 MV3 扩展程序 ZIP 包真实运行。',
      starred: true,
      visits: 18,
      readingMinutes: 4,
      createdAt: now - 3600 * 1000 * 12,
      updatedAt: now - 3600 * 1000 * 2
    },
    {
      id: 'bm-xiaomi-mimo',
      title: 'Xiaomi MiMo 小米大模型技术文档与最新动态 (v2.6)',
      url: 'https://mimo.mi.com/docs/zh-CN/news/latest/v2-6',
      domain: 'mimo.mi.com',
      group: 'AI与前沿',
      tags: ['AI与大模型', '小米生态', 'MiMo'],
      brief: 'Xiaomi MiMo 最新模型演进与 Token Plan 开发者生态指南，为移动端与浏览器扩展提供低延迟流式推理能力。',
      starred: true,
      visits: 14,
      readingMinutes: 6,
      createdAt: now - 3600 * 1000 * 24,
      updatedAt: now - 3600 * 1000 * 5
    },
    {
      id: 'bm-mv3-spec',
      title: '小米浏览器双端扩展开发规范（手机 / Pad 自适应与 API 边界）',
      url: 'https://vibe-coding.browser.miui.com/creator/plugin',
      domain: 'vibe-coding.browser.miui.com',
      group: '研发工程',
      tags: ['开发技术', 'ManifestV3', '双端适配'],
      brief: '基于 clientWidth >= 600px 动态切换 compact/wide 布局，利用 storage.onChanged 实现多标签页护眼阅读实时同步。',
      starred: true,
      visits: 11,
      readingMinutes: 5,
      createdAt: now - 3600 * 1000 * 36,
      updatedAt: now - 3600 * 1000 * 8
    },
    {
      id: 'bm-webcrypto-vault',
      title: 'W3C Web Cryptography API · PBKDF2 与 AES-256-GCM 零知识加密标准',
      url: 'https://developer.mozilla.org/zh-CN/docs/Web/API/SubtleCrypto',
      domain: 'developer.mozilla.org',
      group: '研发工程',
      tags: ['开发技术', '隐私安全', 'WebCrypto'],
      brief: '在浏览器扩展本地使用 SubtleCrypto 派生 256 位密钥并绑定 AAD 附加认证数据，实现不依赖任何云端服务器的私密保险箱。',
      starred: false,
      visits: 7,
      readingMinutes: 8,
      createdAt: now - 3600 * 1000 * 48,
      updatedAt: now - 3600 * 1000 * 16
    }
  ];

  const notes = [
    {
      id: 'note-mi-guide',
      title: '📱 谜盒·灵动知识舱：小米浏览器（手机/Pad）15秒演示速览',
      sourceUrl: 'https://vibe-coding.browser.miui.com/rules',
      sourceTitle: '小米浏览器 Vibe Coding 大赛',
      tags: ['小米生态', '演示指南', '触控交互'],
      starred: true,
      content: [
        '# 谜盒·灵动知识舱（小米浏览器专版）',
        '',
        '专为**小米浏览器（手机与 Pad 双端）**量身设计的触控优先知识舱与 AI 伴读扩展：',
        '',
        '## 核心亮点',
        '- [x] **网页触控灵动胶囊 & 长按划词浮条**：弥补移动端无右键菜单与快捷键痛点，手指选中文字即可「存为笔记 / AI 精读 / 双语对照」。',
        '- [x] **四档全局护眼阅读秒同步**：支持 `暖纸护眼`、`深色夜读`、`墨水屏` 与字号无级调节，基于 `storage.onChanged` 跨标签页毫秒级同步。',
        '- [x] **Xiaomi MiMo 首席预置 + 本地零配置双核 AI**：开箱即用提炼网页三要点，支持 `? 问题` 全库检索直答。',
        '- [x] **AES-256-GCM 零知识保险箱**：21 万次 PBKDF2 密钥派生 + 恢复密钥保护私密账号与 API 令牌。',
        '',
        '```js',
        '// 双端自适应视口探针（SKILL.md §0 标准）',
        'const pageWidth = document.documentElement.clientWidth || innerWidth;',
        'const layout = pageWidth >= 600 ? "wide" : "compact";',
        '```'
      ].join('\n'),
      createdAt: now - 3600 * 1000 * 10,
      updatedAt: now - 3600 * 1000 * 1
    },
    {
      id: 'note-mimo-clip',
      title: '✨ 网页划词摘录：Xiaomi MiMo 流式推理与移动端伴读',
      sourceUrl: 'https://mimo.mi.com/docs/zh-CN/news/latest/v2-6',
      sourceTitle: 'Xiaomi MiMo 技术文档',
      tags: ['AI与大模型', '划词笔记'],
      starred: false,
      content: [
        '## 原文划词摘录',
        '> “给浏览器装上你的专属能力：划词解读、护眼净网、私有知识检索，说给 AI 听，今晚它就上线。”',
        '',
        '## AI 伴读批注',
        '- **场景价值**：在手机或小米平板上阅读长文时，无需频繁切换 App，通过底部伴读抽屉（`sidePanel`）即可边看边记。',
        '- **双端导出兼容**：手机端调用 `chrome.downloads` 一键导出备份，Pad 端自动提供 JSON/Markdown 预览与一键复制。'
      ].join('\n'),
      createdAt: now - 3600 * 1000 * 20,
      updatedAt: now - 3600 * 1000 * 4
    }
  ];

  return { bookmarks, notes };
}

export async function getStorageMap(keys) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local.get(keys);
  }
  return {};
}

export async function setStorageMap(obj) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set(obj);
  }
}

export async function ensureSeedInitialized() {
  const data = await getStorageMap([
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.READING,
    STORAGE_KEYS.BOOKMARKS,
    STORAGE_KEYS.NOTES,
    STORAGE_KEYS.DNR_RULES
  ]);

  const settings = { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
  const reading = { ...DEFAULT_READING, ...(data[STORAGE_KEYS.READING] || {}) };
  const dnr = { ...DEFAULT_DNR, ...(data[STORAGE_KEYS.DNR_RULES] || {}) };
  let bookmarks = Array.isArray(data[STORAGE_KEYS.BOOKMARKS]) ? data[STORAGE_KEYS.BOOKMARKS] : [];
  let notes = Array.isArray(data[STORAGE_KEYS.NOTES]) ? data[STORAGE_KEYS.NOTES] : [];

  if (!settings.initializedSeed && bookmarks.length === 0 && notes.length === 0) {
    const seed = buildContestSeedData();
    bookmarks = seed.bookmarks;
    notes = seed.notes;
    settings.initializedSeed = true;
    await setStorageMap({
      [STORAGE_KEYS.SETTINGS]: settings,
      [STORAGE_KEYS.READING]: reading,
      [STORAGE_KEYS.DNR_RULES]: dnr,
      [STORAGE_KEYS.BOOKMARKS]: bookmarks,
      [STORAGE_KEYS.NOTES]: notes
    });
  } else if (!data[STORAGE_KEYS.READING] || !data[STORAGE_KEYS.SETTINGS]) {
    await setStorageMap({
      [STORAGE_KEYS.SETTINGS]: settings,
      [STORAGE_KEYS.READING]: reading,
      [STORAGE_KEYS.DNR_RULES]: dnr
    });
  }

  return { settings, reading, dnr, bookmarks, notes };
}

export async function resetToContestDemoData() {
  const seed = buildContestSeedData();
  const data = await getStorageMap([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.READING]);
  const settings = { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.SETTINGS] || {}), initializedSeed: true };
  const reading = { ...DEFAULT_READING, ...(data[STORAGE_KEYS.READING] || {}) };
  await setStorageMap({
    [STORAGE_KEYS.SETTINGS]: settings,
    [STORAGE_KEYS.READING]: reading,
    [STORAGE_KEYS.BOOKMARKS]: seed.bookmarks,
    [STORAGE_KEYS.NOTES]: seed.notes
  });
  return { bookmarks: seed.bookmarks, notes: seed.notes, settings, reading };
}

export async function upsertBookmark(payload) {
  const map = await getStorageMap([STORAGE_KEYS.BOOKMARKS]);
  const list = Array.isArray(map[STORAGE_KEYS.BOOKMARKS]) ? [...map[STORAGE_KEYS.BOOKMARKS]] : [];
  const url = String(payload.url || '').trim();
  const title = String(payload.title || url || '未命名网页').trim();
  const intel = inferBookmarkIntelligence({
    title,
    url,
    text: payload.text || '',
    description: payload.brief || payload.description || ''
  });

  const existingIdx = url ? list.findIndex((b) => b.url === url) : -1;
  const now = Date.now();
  let domain = '本地页面';
  try {
    domain = new URL(url).hostname.replace(/^www\./i, '');
  } catch {}

  if (existingIdx >= 0) {
    const prev = list[existingIdx];
    const updated = {
      ...prev,
      title: title || prev.title,
      brief: payload.brief || prev.brief || intel.brief,
      group: payload.group || prev.group || intel.group,
      tags: Array.isArray(payload.tags) && payload.tags.length ? payload.tags : (prev.tags?.length ? prev.tags : intel.tags),
      starred: typeof payload.starred === 'boolean' ? payload.starred : prev.starred,
      visits: (prev.visits || 1) + 1,
      updatedAt: now
    };
    list[existingIdx] = updated;
    await setStorageMap({ [STORAGE_KEYS.BOOKMARKS]: list });
    return { item: updated, isNew: false, total: list.length };
  }

  const item = {
    id: `bm-${randomId(8)}`,
    title,
    url,
    domain,
    group: payload.group || intel.group,
    tags: Array.isArray(payload.tags) && payload.tags.length ? payload.tags : intel.tags,
    brief: payload.brief || intel.brief,
    starred: Boolean(payload.starred),
    visits: 1,
    readingMinutes: intel.readingMinutes,
    createdAt: now,
    updatedAt: now
  };
  list.unshift(item);
  await setStorageMap({ [STORAGE_KEYS.BOOKMARKS]: list });
  return { item, isNew: true, total: list.length };
}

export async function deleteBookmark(id) {
  const map = await getStorageMap([STORAGE_KEYS.BOOKMARKS]);
  const list = (map[STORAGE_KEYS.BOOKMARKS] || []).filter((b) => b.id !== id);
  await setStorageMap({ [STORAGE_KEYS.BOOKMARKS]: list });
  return list;
}

export async function toggleBookmarkStar(id) {
  const map = await getStorageMap([STORAGE_KEYS.BOOKMARKS]);
  const list = (map[STORAGE_KEYS.BOOKMARKS] || []).map((b) =>
    b.id === id ? { ...b, starred: !b.starred, updatedAt: Date.now() } : b
  );
  await setStorageMap({ [STORAGE_KEYS.BOOKMARKS]: list });
  return list;
}

export async function upsertNote(payload) {
  const map = await getStorageMap([STORAGE_KEYS.NOTES]);
  const list = Array.isArray(map[STORAGE_KEYS.NOTES]) ? [...map[STORAGE_KEYS.NOTES]] : [];
  const now = Date.now();

  if (payload.id) {
    const idx = list.findIndex((n) => n.id === payload.id);
    if (idx >= 0) {
      const updated = {
        ...list[idx],
        ...payload,
        updatedAt: now
      };
      list[idx] = updated;
      await setStorageMap({ [STORAGE_KEYS.NOTES]: list });
      return { item: updated, isNew: false };
    }
  }

  const content = String(payload.content || '').trim();
  const title =
    String(payload.title || '').trim() ||
    content.split('\n')[0]?.replace(/^#+\s*/, '').slice(0, 42) ||
    '随手闪念笔记';
  const intel = inferBookmarkIntelligence({
    title,
    url: payload.sourceUrl || '',
    text: content
  });

  const item = {
    id: `note-${randomId(8)}`,
    title,
    content,
    sourceUrl: payload.sourceUrl || '',
    sourceTitle: payload.sourceTitle || '',
    screenshotDataUrl: payload.screenshotDataUrl || '',
    tags: Array.isArray(payload.tags) && payload.tags.length ? payload.tags : intel.tags,
    starred: Boolean(payload.starred),
    createdAt: now,
    updatedAt: now
  };
  list.unshift(item);
  await setStorageMap({ [STORAGE_KEYS.NOTES]: list });
  return { item, isNew: true };
}

export async function deleteNote(id) {
  const map = await getStorageMap([STORAGE_KEYS.NOTES]);
  const list = (map[STORAGE_KEYS.NOTES] || []).filter((n) => n.id !== id);
  await setStorageMap({ [STORAGE_KEYS.NOTES]: list });
  return list;
}

/**
 * 严格遵循 SKILL.md §3 手机 / Pad 差异规范：
 * 手机支持 chrome.downloads.download，Pad 不可用；始终返回完整导出文本供预览与一键复制
 */
export async function exportKnowledgeBundle(format = 'json') {
  const all = await getStorageMap([
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.READING,
    STORAGE_KEYS.BOOKMARKS,
    STORAGE_KEYS.NOTES,
    STORAGE_KEYS.VAULT_HEADER,
    STORAGE_KEYS.VAULT_ITEMS
  ]);

  const bookmarks = all[STORAGE_KEYS.BOOKMARKS] || [];
  const notes = all[STORAGE_KEYS.NOTES] || [];
  let text = '';
  let filename = '';
  let mime = 'application/json';

  if (format === 'markdown') {
    filename = `mibox-xiaomi-notes-${new Date().toISOString().slice(0, 10)}.md`;
    mime = 'text/markdown';
    const mdParts = [
      `# 谜盒·灵动知识舱 导出归档（${new Date().toLocaleString('zh-CN')}）`,
      ``,
      `## 一、精选收藏（${bookmarks.length} 条）`,
      ...bookmarks.map(
        (b, i) => `${i + 1}. **[${b.title}](${b.url})** (\`${b.group || '未分组'}\`)\n   - 简介：${b.brief || ''}\n   - 标签：${(b.tags || []).join(', ')}`
      ),
      ``,
      `## 二、闪念与伴读笔记（${notes.length} 篇）`,
      ...notes.map(
        (n) => `### ${n.title}\n- 来源：${n.sourceUrl || '直接创建'}\n- 标签：${(n.tags || []).join(', ')}\n\n${n.content}\n\n---`
      )
    ];
    text = mdParts.join('\n');
  } else {
    filename = `mibox-xiaomi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    text = JSON.stringify(
      {
        app: 'mibox-xiaomi',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        bookmarks,
        notes,
        reading: all[STORAGE_KEYS.READING] || DEFAULT_READING,
        vaultHeader: all[STORAGE_KEYS.VAULT_HEADER] || null,
        vaultItems: all[STORAGE_KEYS.VAULT_ITEMS] || []
      },
      null,
      2
    );
  }

  let downloaded = false;
  let statusMessage = '';

  if (typeof chrome !== 'undefined' && typeof chrome.downloads?.download === 'function') {
    try {
      const dataUrl = `data:${mime};charset=utf-8,` + encodeURIComponent(text);
      await chrome.downloads.download({
        url: dataUrl,
        filename,
        conflictAction: 'uniquify',
        saveAs: false
      });
      downloaded = true;
      statusMessage = `已创建浏览器下载任务（${filename}），同时在下方提供预览与复制。`;
    } catch {
      statusMessage = '当前环境未触发文件下载，已自动切换为下方内容预览与一键复制（兼容小米平板 Pad 端）。';
    }
  } else {
    statusMessage = '当前设备端不支持扩展直接下载（如小米 Pad 端），已为您提供完整内容预览与一键复制。';
  }

  return {
    ok: true,
    downloaded,
    filename,
    text,
    statusMessage
  };
}
