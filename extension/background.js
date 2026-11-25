// 谜盒·划词笔记 后台服务进程（Manifest V3 Service Worker）
// // 1. 不在 Service Worker 中访问 window / document / screen
// 2. 不调用 bookmarks / history / contextMenus / omnibox / identity / proxy / tabs.remove 等禁用接口
// 3. 异步消息统一使用 sendResponse + return true，状态持久化至 chrome.storage.local

import {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  DEFAULT_READING,
  DEFAULT_DNR,
  ensureSeedInitialized,
  resetToContestDemoData,
  upsertBookmark,
  deleteBookmark,
  toggleBookmarkStar,
  upsertNote,
  deleteNote,
  getStorageMap,
  setStorageMap
} from './src/shared/storage-repo.js';
import {
  createVaultHeader,
  unlockVaultWithPassword,
  resetPasswordWithRecoveryKey,
  encryptVaultItem,
  decryptVaultItem,
  randomId
} from './src/shared/crypto.js';
import {
  runSmartAiTask,
  answerFromKnowledgeBase,
  inferBookmarkIntelligence
} from './src/shared/ai-engine.js';

const VAULT_ALARM_NAME = 'mb-vault-autolock';

/**
 * 更新当前活动标签页的扩展图标角标
 */
async function refreshBadgeForTab(tabId, url) {
  if (!chrome.action?.setBadgeText) return;
  try {
    if (!url || !/^https?:\/\//i.test(url)) {
      await chrome.action.setBadgeText({ text: '', ...(tabId ? { tabId } : {}) });
      return;
    }
    const map = await getStorageMap([STORAGE_KEYS.BOOKMARKS, STORAGE_KEYS.NOTES]);
    const bookmarks = map[STORAGE_KEYS.BOOKMARKS] || [];
    const notes = map[STORAGE_KEYS.NOTES] || [];
    const hasMatch =
      bookmarks.some((b) => b.url === url) ||
      notes.some((n) => n.sourceUrl === url);
    await chrome.action.setBadgeText({
      text: hasMatch ? '✓' : '',
      ...(tabId ? { tabId } : {})
    });
  } catch {
    // 忽略特殊标签页角标设置异常
  }
}

/**
 * 配置 declarativeNetRequest 动态净网规则
 */
async function applyDnrPurifierRules(dnrConfig) {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    return { ok: false, reason: '当前浏览器环境未启用 declarativeNetRequest 动态规则接口' };
  }
  const cfg = { ...DEFAULT_DNR, ...(dnrConfig || {}) };
  const removeRuleIds = [1001, 1002, 1003, 1004, 1005];
  const addRules = [];

  if (cfg.enabled) {
    addRules.push({
      id: 1001,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '/ads/',
        resourceTypes: ['image', 'sub_frame']
      }
    });
    addRules.push({
      id: 1002,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: 'banner_ad',
        resourceTypes: ['image']
      }
    });
    const domains = Array.isArray(cfg.blockedDomains)
      ? cfg.blockedDomains.map((d) => String(d).trim()).filter(Boolean)
      : [];
    if (domains.length > 0) {
      addRules.push({
        id: 1003,
        priority: 1,
        action: { type: 'block' },
        condition: {
          requestDomains: domains.slice(0, 20),
          resourceTypes: ['image', 'script', 'sub_frame']
        }
      });
    }
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules
    });
    await setStorageMap({ [STORAGE_KEYS.DNR_RULES]: cfg });
    return { ok: true, activeRulesCount: addRules.length, config: cfg };
  } catch (err) {
    return { ok: false, reason: err?.message || 'DNR 规则更新失败' };
  }
}

/**
 * 保险箱会话状态读写
 */
async function getActiveVaultMasterKey() {
  const map = await getStorageMap([STORAGE_KEYS.VAULT_SESSION]);
  const sess = map[STORAGE_KEYS.VAULT_SESSION];
  if (!sess || !sess.masterKeyBase64) return null;
  if (sess.expiresAt && Date.now() > sess.expiresAt) {
    await setStorageMap({ [STORAGE_KEYS.VAULT_SESSION]: null });
    return null;
  }
  return sess.masterKeyBase64;
}

async function setActiveVaultSession(masterKeyBase64, autoLockMinutes = 15) {
  const mins = Math.max(1, Number(autoLockMinutes) || 15);
  const expiresAt = Date.now() + mins * 60 * 1000;
  await setStorageMap({
    [STORAGE_KEYS.VAULT_SESSION]: {
      masterKeyBase64,
      expiresAt
    }
  });
  if (chrome.alarms?.create) {
    await chrome.alarms.clear(VAULT_ALARM_NAME).catch(() => {});
    chrome.alarms.create(VAULT_ALARM_NAME, { delayInMinutes: mins });
  }
}

async function lockVaultSession() {
  await setStorageMap({ [STORAGE_KEYS.VAULT_SESSION]: null });
  if (chrome.alarms?.clear) {
    await chrome.alarms.clear(VAULT_ALARM_NAME).catch(() => {});
  }
}

async function listDecryptedVaultItems() {
  const masterKey = await getActiveVaultMasterKey();
  const map = await getStorageMap([STORAGE_KEYS.VAULT_HEADER, STORAGE_KEYS.VAULT_ITEMS]);
  const header = map[STORAGE_KEYS.VAULT_HEADER] || null;
  const rawItems = Array.isArray(map[STORAGE_KEYS.VAULT_ITEMS]) ? map[STORAGE_KEYS.VAULT_ITEMS] : [];

  if (!header) {
    return { initialized: false, unlocked: false, items: [] };
  }
  if (!masterKey) {
    return { initialized: true, unlocked: false, count: rawItems.length, items: [] };
  }

  const decrypted = [];
  for (const rec of rawItems) {
    try {
      const payload = await decryptVaultItem(masterKey, rec);
      decrypted.push({
        id: rec.id,
        updatedAt: rec.updatedAt,
        ...payload
      });
    } catch {
      // 跳过损坏条目
    }
  }
  return {
    initialized: true,
    unlocked: true,
    count: decrypted.length,
    items: decrypted
  };
}

/**
 * 执行小米浏览器双端 API 兼容性实时自检
 */
async function runXiaomiCapabilitySelfCheck() {
  const checks = [
    {
      id: 'mv3-runtime',
      name: 'Manifest V3 运行时与消息总线',
      spec: 'runtime.id / getManifest / sendMessage',
      ok: Boolean(chrome.runtime?.id && chrome.runtime?.getManifest)
    },
    {
      id: 'storage-local',
      name: '本地持久化与跨标签同步',
      spec: 'storage.local + storage.onChanged',
      ok: Boolean(chrome.storage?.local && chrome.storage?.onChanged)
    },
    {
      id: 'tabs-scripting',
      name: '标签页查询与顶层脚本/CSS 注入',
      spec: 'tabs.query + scripting.executeScript / insertCSS',
      ok: Boolean(chrome.tabs?.query && chrome.scripting?.executeScript)
    },
    {
      id: 'sidepanel-drawer',
      name: '伴读面板（手机底部抽屉 / Pad 侧栏）',
      spec: 'sidePanel.open / setOptions',
      ok: Boolean(chrome.sidePanel)
    },
    {
      id: 'dnr-purifier',
      name: 'DNR 声明式净网与图片过滤',
      spec: 'declarativeNetRequest.updateDynamicRules',
      ok: Boolean(chrome.declarativeNetRequest?.updateDynamicRules)
    },
    {
      id: 'webcrypto-vault',
      name: 'WebCrypto 零知识加密保险箱',
      spec: 'PBKDF2-SHA256 (210,000次) + AES-256-GCM',
      ok: Boolean(globalThis.crypto?.subtle)
    },
    {
      id: 'downloads-adaptive',
      name: '手机 / Pad 双端自适应导出策略',
      spec: typeof chrome.downloads?.download === 'function'
        ? '已检测到 downloads API（手机端直出文件 + 预览复制双模）'
        : '当前端无 downloads API（Pad 端已自动启用预览与一键复制）',
      ok: true
    }
  ];
  return {
    ok: true,
    version: chrome.runtime?.getManifest?.()?.version || '1.3.0',
    checks
  };
}

// 同步注册生命周期与消息监听器
chrome.runtime.onInstalled.addListener(() => {
  ensureSeedInitialized()
    .then(async ({ dnr }) => {
      if (dnr?.enabled) await applyDnrPurifierRules(dnr);
    })
    .catch((e) => console.warn('[谜盒·小米版] 初始化失败', e));
});

chrome.runtime.onStartup.addListener(() => {
  ensureSeedInitialized().catch(() => {});
});

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === VAULT_ALARM_NAME) {
      lockVaultSession().catch(() => {});
    }
  });
}

if (chrome.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await chrome.tabs.get(tabId);
      await refreshBadgeForTab(tabId, tab?.url);
    } catch {}
  });
}

if (chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      refreshBadgeForTab(tabId, tab?.url || changeInfo.url).catch(() => {});
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender?.id && sender.id !== chrome.runtime.id) {
    return false;
  }

  const type = message?.type;
  if (!type) return false;

  (async () => {
    switch (type) {
      case 'GET_DASHBOARD_DATA': {
        const state = await ensureSeedInitialized();
        const vault = await listDecryptedVaultItems();
        return { ok: true, ...state, vault };
      }

      case 'SAVE_READING_MODE': {
        const map = await getStorageMap([STORAGE_KEYS.READING]);
        const prev = { ...DEFAULT_READING, ...(map[STORAGE_KEYS.READING] || {}) };
        const nextMode = ['off', 'warm', 'dark', 'eink'].includes(message.mode)
          ? message.mode
          : prev.mode;
        const nextScale = Number(message.fontScale) || prev.fontScale || 100;
        const nextReading = {
          ...prev,
          mode: nextMode,
          fontScale: Math.min(140, Math.max(85, nextScale)),
          showReadingBadge:
            typeof message.showReadingBadge === 'boolean'
              ? message.showReadingBadge
              : prev.showReadingBadge
        };
        await setStorageMap({ [STORAGE_KEYS.READING]: nextReading });
        return { ok: true, reading: nextReading };
      }

      case 'SAVE_SETTINGS': {
        const map = await getStorageMap([STORAGE_KEYS.SETTINGS]);
        const prev = { ...DEFAULT_SETTINGS, ...(map[STORAGE_KEYS.SETTINGS] || {}) };
        const next = {
          ...prev,
          ...(message.settings || {}),
          ai: {
            ...prev.ai,
            ...(message.settings?.ai || {})
          }
        };
        await setStorageMap({ [STORAGE_KEYS.SETTINGS]: next });
        return { ok: true, settings: next };
      }

      case 'TOGGLE_DNR_PURIFY': {
        const map = await getStorageMap([STORAGE_KEYS.DNR_RULES]);
        const prev = { ...DEFAULT_DNR, ...(map[STORAGE_KEYS.DNR_RULES] || {}) };
        const next = {
          ...prev,
          ...(message.config || {}),
          enabled:
            typeof message.enabled === 'boolean' ? message.enabled : !prev.enabled
        };
        return applyDnrPurifierRules(next);
      }

      case 'COLLECT_BOOKMARK': {
        const res = await upsertBookmark(message.payload || {});
        if (sender?.tab?.id) {
          await refreshBadgeForTab(sender.tab.id, res.item.url);
        }
        return { ok: true, ...res };
      }

      case 'DELETE_BOOKMARK': {
        const list = await deleteBookmark(message.id);
        return { ok: true, bookmarks: list };
      }

      case 'TOGGLE_BOOKMARK_STAR': {
        const list = await toggleBookmarkStar(message.id);
        return { ok: true, bookmarks: list };
      }

      case 'SAVE_NOTE': {
        const res = await upsertNote(message.payload || {});
        if (sender?.tab?.id && res.item.sourceUrl) {
          await refreshBadgeForTab(sender.tab.id, res.item.sourceUrl);
        }
        return { ok: true, ...res };
      }

      case 'DELETE_NOTE': {
        const list = await deleteNote(message.id);
        return { ok: true, notes: list };
      }

      case 'CAPTURE_VISIBLE_TAB_TO_NOTE': {
        if (!chrome.tabs?.captureVisibleTab) {
          return { ok: false, error: '当前环境不支持可见页截图 API' };
        }
        try {
          const dataUrl = await chrome.tabs.captureVisibleTab({
            format: 'jpeg',
            quality: 75
          });
          const title = `网页可见区截图：${message.pageTitle || '当前阅读页'}`;
          const content = [
            `## 网页可见区域快照`,
            `- **来源标题**：${message.pageTitle || '当前网页'}`,
            `- **来源网址**：${message.pageUrl || ''}`,
            `- **抓取时间**：${new Date().toLocaleString('zh-CN')}`,
            ``,
            `> 已通过 \`chrome.tabs.captureVisibleTab\` 抓取当前视口画面并归档至本地笔记。`
          ].join('\n');
          const saved = await upsertNote({
            title,
            content,
            sourceUrl: message.pageUrl || '',
            sourceTitle: message.pageTitle || '',
            screenshotDataUrl: dataUrl,
            tags: ['网页快照', '视觉笔记']
          });
          return { ok: true, item: saved.item, screenshotDataUrl: dataUrl };
        } catch (err) {
          return {
            ok: false,
            error: `未能抓取当前可见页（${err?.message || '权限或特殊页面限制'}），请确保当前处于普通网页标签。`
          };
        }
      }

      case 'AI_ANALYZE': {
        const state = await ensureSeedInitialized();
        const res = await runSmartAiTask({
          aiConfig: state.settings?.ai || DEFAULT_SETTINGS.ai,
          taskMode: message.taskMode || 'summary',
          prompt: message.prompt || '',
          pageContext: message.pageContext || {},
          knowledgeBase: {
            bookmarks: state.bookmarks,
            notes: state.notes
          }
        });
        return res;
      }

      case 'KB_SEARCH_QA': {
        const state = await ensureSeedInitialized();
        const q = String(message.query || '').trim();
        const qa = answerFromKnowledgeBase(q, {
          bookmarks: state.bookmarks,
          notes: state.notes
        });
        return { ok: true, ...qa };
      }

      case 'VAULT_INIT': {
        const created = await createVaultHeader(message.password);
        await setStorageMap({
          [STORAGE_KEYS.VAULT_HEADER]: created.header,
          [STORAGE_KEYS.VAULT_ITEMS]: []
        });
        await setActiveVaultSession(created.masterKeyBase64, 15);
        const vault = await listDecryptedVaultItems();
        return {
          ok: true,
          recoveryKeyText: created.recoveryKeyText,
          vault
        };
      }

      case 'VAULT_UNLOCK': {
        const map = await getStorageMap([STORAGE_KEYS.VAULT_HEADER, STORAGE_KEYS.SETTINGS]);
        const header = map[STORAGE_KEYS.VAULT_HEADER];
        const masterKeyBase64 = await unlockVaultWithPassword(header, message.password);
        const mins = map[STORAGE_KEYS.SETTINGS]?.vaultAutoLockMinutes || 15;
        await setActiveVaultSession(masterKeyBase64, mins);
        const vault = await listDecryptedVaultItems();
        return { ok: true, vault };
      }

      case 'VAULT_RESET_BY_RECOVERY': {
        const map = await getStorageMap([STORAGE_KEYS.VAULT_HEADER]);
        const header = map[STORAGE_KEYS.VAULT_HEADER];
        const reset = await resetPasswordWithRecoveryKey(
          header,
          message.recoveryKey,
          message.newPassword
        );
        await setStorageMap({ [STORAGE_KEYS.VAULT_HEADER]: reset.header });
        await setActiveVaultSession(reset.masterKeyBase64, 15);
        const vault = await listDecryptedVaultItems();
        return { ok: true, vault };
      }

      case 'VAULT_LOCK': {
        await lockVaultSession();
        const vault = await listDecryptedVaultItems();
        return { ok: true, vault };
      }

      case 'VAULT_SAVE_ITEM': {
        const masterKey = await getActiveVaultMasterKey();
        if (!masterKey) throw new Error('保险箱已锁定，请先输入主密码解锁');
        const map = await getStorageMap([STORAGE_KEYS.VAULT_ITEMS]);
        const list = Array.isArray(map[STORAGE_KEYS.VAULT_ITEMS]) ? [...map[STORAGE_KEYS.VAULT_ITEMS]] : [];
        const id = message.item?.id || `v-${randomId(6)}`;
        const encrypted = await encryptVaultItem(masterKey, id, {
          title: String(message.item?.title || '未命名凭据').trim(),
          category: message.item?.category || 'login',
          domain: String(message.item?.domain || '').trim(),
          username: String(message.item?.username || '').trim(),
          secret: String(message.item?.secret || ''),
          note: String(message.item?.note || '').trim()
        });
        const idx = list.findIndex((x) => x.id === id);
        if (idx >= 0) list[idx] = encrypted;
        else list.unshift(encrypted);
        await setStorageMap({ [STORAGE_KEYS.VAULT_ITEMS]: list });
        const vault = await listDecryptedVaultItems();
        return { ok: true, vault };
      }

      case 'VAULT_DELETE_ITEM': {
        const map = await getStorageMap([STORAGE_KEYS.VAULT_ITEMS]);
        const list = (map[STORAGE_KEYS.VAULT_ITEMS] || []).filter((x) => x.id !== message.id);
        await setStorageMap({ [STORAGE_KEYS.VAULT_ITEMS]: list });
        const vault = await listDecryptedVaultItems();
        return { ok: true, vault };
      }

      case 'RESET_DEMO_DATA': {
        const res = await resetToContestDemoData();
        return { ok: true, ...res };
      }

      case 'RUN_SELF_CHECK': {
        return runXiaomiCapabilitySelfCheck();
      }

      default:
        return { ok: false, error: `未知消息类型: ${type}` };
    }
  })()
    .then((res) => sendResponse(res))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));

  return true;
});
