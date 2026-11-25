// 谜盒·小米版 统一本地存储仓库

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
 * 首次安装时写入的示例数据，让第一次打开就能看到收藏和笔记长什么样
 */
export function buildContestSeedData() {
  const now = Date.now();
  const hour = 3600 * 1000;
  const bookmarks = [
    {
      id: 'bm-selection-api',
      title: 'Selection API - Web API | MDN',
      url: 'https://developer.mozilla.org/zh-CN/docs/Web/API/Selection',
      domain: 'developer.mozilla.org',
      group: '研发工程',
      tags: ['开发技术', '划词'],
      brief: '网页里选中的文字由 Selection 对象表示，手机上长按选字后可以用 getSelection() 拿到内容和位置。',
      starred: true,
      visits: 9,
      readingMinutes: 6,
      createdAt: now - hour * 30,
      updatedAt: now - hour * 3
    },
    {
      id: 'bm-xiaomi-rules',
      title: '小米浏览器扩展程序：手机与平板的布局适配',
      url: 'https://vibe-coding.browser.miui.com/rules',
      domain: 'vibe-coding.browser.miui.com',
      group: '小米与硬件',
      tags: ['小米浏览器', '双端适配'],
      brief: '小米浏览器手机和平板都能装扩展；页面宽度小于 600px 按手机排版，大于等于 600px 按平板排版。',
      starred: true,
      visits: 6,
      readingMinutes: 4,
      createdAt: now - hour * 20,
      updatedAt: now - hour * 6
    },
    {
      id: 'bm-storage-api',
      title: 'chrome.storage API | Chrome for Developers',
      url: 'https://developer.chrome.com/docs/extensions/reference/api/storage',
      domain: 'developer.chrome.com',
      group: '研发工程',
      tags: ['开发技术', '本地存储'],
      brief: 'storage.local 保存在本机；storage.onChanged 能让所有打开的页面在设置变化时同时收到通知。',
      starred: false,
      visits: 4,
      readingMinutes: 8,
      createdAt: now - hour * 48,
      updatedAt: now - hour * 12
    }
  ];

  const notes = [
    {
      id: 'note-howto',
      title: '三步上手',
      sourceUrl: '',
      sourceTitle: '',
      tags: ['使用说明'],
      starred: true,
      content: [
        '# 三步上手',
        '',
        '1. 打开任意文章，手指长按选中一段文字',
        '2. 底部弹出操作条，点「存笔记」，这段话连同出处就到了这里',
        '3. 晚上看书伤眼？点右下角胶囊，切到「暖纸」或「夜读」，所有标签页一起变',
        '',
        '不懂的词点「解释」，外文点「翻译」。默认在本机处理，不需要注册或填 Key。'
      ].join('\n'),
      createdAt: now - hour * 10,
      updatedAt: now - hour * 1
    },
    {
      id: 'note-clip-demo',
      title: '摘录：手机上怎么拿到选中的文字',
      sourceUrl: 'https://developer.mozilla.org/zh-CN/docs/Web/API/Selection',
      sourceTitle: 'Selection API - MDN',
      tags: ['划词笔记'],
      starred: false,
      content: [
        '> Selection 对象表示用户选择的文本范围或插入符号的当前位置。',
        '',
        '- 手机上没有右键菜单，长按选字后监听 selectionchange 就能弹出自己的操作条',
        '- 操作条要放在拇指够得到的位置，按钮高度不低于 44px'
      ].join('\n'),
      createdAt: now - hour * 20,
      updatedAt: now - hour * 4
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
 * 手机 / Pad 差异规范：
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
      `# 谜盒·划词笔记 导出归档（${new Date().toLocaleString('zh-CN')}）`,
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
