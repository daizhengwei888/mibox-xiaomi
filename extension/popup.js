// 谜盒·划词笔记 Popup 控制舱

import {
  SKINS,
  installViewportObserver,
  applySkinToDocument,
  extractDomain,
  escapeHtml
} from './src/shared/viewport.js';

let appState = {
  settings: { skin: 'xiaomi-orange' },
  reading: { mode: 'off', fontScale: 100 },
  dnr: { enabled: false },
  bookmarks: [],
  notes: []
};

let activeTabInfo = {
  id: null,
  title: '',
  url: '',
  text: ''
};

let lastAiResultText = '';

function setStatus(msg) {
  const el = document.getElementById('pop-status-bar');
  if (el) el.textContent = msg;
}

/**
 * 读取当前活动标签页上下文（优先通过 content_script 消息，回退顶层 scripting.executeScript）
 */
async function probeActiveTabContext() {
  if (!chrome.tabs?.query) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    activeTabInfo.id = tab.id;
    activeTabInfo.title = tab.title || '当前网页';
    activeTabInfo.url = tab.url || '';

    const titleEl = document.getElementById('page-title-display');
    const domainEl = document.getElementById('current-page-domain');
    const metaEl = document.getElementById('page-meta-display');

    if (titleEl) titleEl.textContent = activeTabInfo.title;
    if (domainEl) domainEl.textContent = extractDomain(activeTabInfo.url);

    if (Number.isInteger(tab.id) && tab.id > 0 && /^https?:\/\//i.test(activeTabInfo.url)) {
      try {
        const ctx = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_CONTEXT' });
        if (ctx?.ok) {
          activeTabInfo.title = ctx.title || activeTabInfo.title;
          activeTabInfo.text = ctx.text || '';
          if (titleEl) titleEl.textContent = activeTabInfo.title;
          if (metaEl) {
            metaEl.textContent = `预计阅读 ${ctx.readingMinutes || 1} 分钟 · ${extractDomain(activeTabInfo.url)}`;
          }
          return;
        }
      } catch {
        // 若页面尚未注入 content_script，回退使用顶层 executeScript（不传 allFrames）
      }

      if (chrome.scripting?.executeScript) {
        try {
          const [inj] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({
              title: document.title,
              url: location.href,
              text: (document.body?.innerText || '').slice(0, 4500)
            })
          });
          if (inj?.result) {
            activeTabInfo.title = inj.result.title || activeTabInfo.title;
            activeTabInfo.text = inj.result.text || '';
            if (titleEl) titleEl.textContent = activeTabInfo.title;
            const mins = Math.max(1, Math.ceil((activeTabInfo.text.length || 300) / 480));
            if (metaEl) metaEl.textContent = `预计阅读 ${mins} 分钟 · ${extractDomain(activeTabInfo.url)}`;
          }
        } catch {
          if (metaEl) metaEl.textContent = '系统页面或未授权页面（全局设置仍可保存）';
        }
      }
    } else if (metaEl) {
      metaEl.textContent = '浏览器内部页，打开普通网页后可用';
    }
  } catch {}
}

function renderStateToPopup() {
  applySkinToDocument(appState.settings?.skin || 'xiaomi-orange');

  const bmCount = document.getElementById('stat-bm-count');
  const noteCount = document.getElementById('stat-note-count');
  if (bmCount) bmCount.textContent = String(appState.bookmarks?.length || 0);
  if (noteCount) noteCount.textContent = String(appState.notes?.length || 0);

  // 阅读模式高亮
  const currentMode = appState.reading?.mode || 'off';
  document.querySelectorAll('#reading-mode-buttons [data-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === currentMode);
  });

  // 字号高亮
  const currentScale = String(appState.reading?.fontScale || 100);
  document.querySelectorAll('#font-scale-buttons [data-scale]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-scale') === currentScale);
  });

  // DNR 按钮状态
  const dnrBtn = document.getElementById('btn-toggle-dnr');
  if (dnrBtn) {
    const on = Boolean(appState.dnr?.enabled);
    dnrBtn.textContent = on ? '已开启 ✓' : '未开启';
    dnrBtn.classList.toggle('primary', on);
  }

  // AI 引擎标识
  const aiBadge = document.getElementById('ai-engine-badge');
  if (aiBadge) {
    const hasKey = Boolean(appState.settings?.ai?.apiKey);
    aiBadge.textContent = hasKey
      ? `${appState.settings.ai.model || '云端模型'}`
      : '本地模式';
  }
}

/**
 * 遵循 references/examples.md §1 完整闭环：
 * popup 点击 -> runtime.sendMessage -> SW 保存 local -> storage.onChanged 更新所有匹配页面 -> tabs.sendMessage 确认当前页是否应用
 */
async function updateReadingPreference(patch) {
  const nextMode = patch.mode ?? appState.reading.mode;
  const nextScale = patch.fontScale ?? appState.reading.fontScale;
  const syncBadge = document.getElementById('reading-sync-status');

  const res = await chrome.runtime.sendMessage({
    type: 'SAVE_READING_MODE',
    mode: nextMode,
    fontScale: nextScale
  });

  if (!res?.ok) {
    setStatus('保存阅读设置失败');
    return;
  }
  appState.reading = res.reading;
  renderStateToPopup();

  // 向当前活动标签页发送确认消息
  if (Number.isInteger(activeTabInfo.id) && activeTabInfo.id > 0) {
    try {
      const tabRes = await chrome.tabs.sendMessage(activeTabInfo.id, {
        type: 'APPLY_READING_MODE',
        mode: appState.reading.mode,
        fontScale: appState.reading.fontScale
      });
      if (tabRes?.ok) {
        if (syncBadge) syncBadge.textContent = '当前页已应用';
        setStatus(`全局阅读设置已同步，当前页已应用（${appState.reading.mode}）`);
        return;
      }
    } catch {}
  }
  if (syncBadge) syncBadge.textContent = '已保存，刷新页面生效';
  setStatus('全局设置已保存，当前页未应用（刷新授权网页即可生效）');
}

function bindPopupEvents() {
  // 顶部 Tab 切换
  document.querySelectorAll('.pop-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const target = tabBtn.getAttribute('data-tab');
      document.querySelectorAll('.pop-tab').forEach((b) => b.classList.toggle('active', b === tabBtn));
      document.querySelectorAll('.pop-panel').forEach((p) => {
        p.classList.toggle('active', p.id === `tab-${target}`);
      });
    });
  });

  // 切换五套皮肤
  document.getElementById('btn-cycle-skin')?.addEventListener('click', async () => {
    const idx = SKINS.findIndex((s) => s.id === appState.settings?.skin);
    const nextSkin = SKINS[(idx + 1) % SKINS.length];
    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: { skin: nextSkin.id }
    });
    if (res?.ok) {
      appState.settings = res.settings;
      renderStateToPopup();
      setStatus(`已切换皮肤：${nextSkin.name}`);
    }
  });

  // 显式用户点击打开 sidePanel
  document.getElementById('btn-open-drawer')?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (chrome.sidePanel?.open && tab?.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
        window.close();
        return;
      }
    } catch {}
    // 若当前环境未直接唤起抽屉，回退在新标签打开伴读面板
    await chrome.tabs.create({ url: chrome.runtime.getURL('panel.html') });
  });

  const openFullWorkspace = async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
  };
  document.getElementById('btn-open-app')?.addEventListener('click', openFullWorkspace);
  document.getElementById('btn-footer-workspace')?.addEventListener('click', openFullWorkspace);

  // 一键收藏当前页
  document.getElementById('btn-collect-page')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-collect-page');
    btn.textContent = '收藏中…';
    const res = await chrome.runtime.sendMessage({
      type: 'COLLECT_BOOKMARK',
      payload: {
        title: activeTabInfo.title || '小米浏览器精选网页',
        url: activeTabInfo.url || 'https://vibe-coding.browser.miui.com/rules',
        text: activeTabInfo.text
      }
    });
    if (res?.ok) {
      btn.textContent = '已收藏';
      const metaEl = document.getElementById('page-meta-display');
      if (metaEl) {
        metaEl.textContent = `[${res.item.group}] ${(res.item.tags || []).map((t) => `#${t}`).join(' ')} · ${res.item.brief}`;
      }
      const dash = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' });
      if (dash?.ok) {
        appState.bookmarks = dash.bookmarks;
        renderStateToPopup();
      }
      setStatus(`已归档至「${res.item.group}」分组`);
    } else {
      btn.textContent = '收藏本页';
    }
  });

  // 可见页截图入笔记
  document.getElementById('btn-capture-page')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-capture-page');
    btn.textContent = '截图中…';
    const res = await chrome.runtime.sendMessage({
      type: 'CAPTURE_VISIBLE_TAB_TO_NOTE',
      pageTitle: activeTabInfo.title,
      pageUrl: activeTabInfo.url
    });
    if (res?.ok) {
      btn.textContent = '已存截图笔记';
      setStatus('已抓取当前可见页画面并存入笔记');
    } else {
      btn.textContent = '截图入笔记';
      setStatus(res?.error || '当前页面不支持截图');
    }
  });

  // 阅读主题切换
  document.querySelectorAll('#reading-mode-buttons [data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      updateReadingPreference({ mode: btn.getAttribute('data-mode') });
    });
  });

  // 正文字号切换
  document.querySelectorAll('#font-scale-buttons [data-scale]').forEach((btn) => {
    btn.addEventListener('click', () => {
      updateReadingPreference({ fontScale: Number(btn.getAttribute('data-scale')) });
    });
  });

  // DNR 省流净图切换
  document.getElementById('btn-toggle-dnr')?.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({
      type: 'TOGGLE_DNR_PURIFY',
      enabled: !appState.dnr?.enabled
    });
    if (res?.ok) {
      appState.dnr = res.config;
      renderStateToPopup();
      setStatus(
        appState.dnr.enabled
          ? `已开启 ${res.activeRulesCount} 条屏蔽规则，刷新页面生效`
          : '已关闭广告图片屏蔽'
      );
    } else {
      setStatus(res?.reason || 'DNR 规则切换失败');
    }
  });

  // AI 提炼本页三要点
  document.getElementById('btn-ai-summary')?.addEventListener('click', async () => {
    const out = document.getElementById('ai-output-box');
    if (out) out.textContent = '正在提取要点…';
    const res = await chrome.runtime.sendMessage({
      type: 'AI_ANALYZE',
      taskMode: 'summary',
      pageContext: {
        title: activeTabInfo.title,
        url: activeTabInfo.url,
        text: activeTabInfo.text
      }
    });
    if (res?.ok && out) {
      lastAiResultText = res.text;
      out.textContent = res.text;
      setStatus(`分析完成（引擎：${res.model}）`);
    }
  });

  // 将 AI 速读结果存为笔记
  document.getElementById('btn-ai-save-note')?.addEventListener('click', async () => {
    const text = lastAiResultText || document.getElementById('ai-output-box')?.textContent || '';
    if (!text) return;
    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_NOTE',
      payload: {
        title: `AI 速读：${activeTabInfo.title || '网页要点'}`,
        content: text,
        sourceUrl: activeTabInfo.url,
        sourceTitle: activeTabInfo.title,
        tags: ['AI速读', '要点提炼']
      }
    });
    if (res?.ok) {
      setStatus('已将 AI 速读要点归档至谜盒笔记');
    }
  });

  // 全库检索与 `?` 直答
  const runQuickSearch = async () => {
    const q = document.getElementById('quick-search-input')?.value?.trim() || '';
    const box = document.getElementById('quick-search-results');
    if (!box) return;
    const res = await chrome.runtime.sendMessage({
      type: 'KB_SEARCH_QA',
      query: q || '小米浏览器'
    });
    if (res?.ok) {
      if (!res.matches || res.matches.length === 0) {
        box.innerHTML = `<div class="pop-result-item">${escapeHtml(res.answer)}</div>`;
        return;
      }
      box.innerHTML = res.matches
        .map(
          (m) => `
          <div class="pop-result-item" data-url="${escapeHtml(m.url || '')}">
            <b>${m.type === 'note' ? '' : ''} ${escapeHtml(m.title)}</b>
            <span>${escapeHtml(m.content.slice(0, 78))}…</span>
          </div>
        `
        )
        .join('');
      box.querySelectorAll('.pop-result-item[data-url]').forEach((item) => {
        item.addEventListener('click', () => {
          const url = item.getAttribute('data-url');
          if (url && /^https?:\/\//i.test(url)) {
            chrome.tabs.create({ url });
          } else {
            openFullWorkspace();
          }
        });
      });
    }
  };

  document.getElementById('btn-quick-search')?.addEventListener('click', runQuickSearch);
  document.getElementById('quick-search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runQuickSearch();
  });

  // 保存随手闪念笔记
  document.getElementById('btn-save-quick-note')?.addEventListener('click', async () => {
    const ta = document.getElementById('quick-note-text');
    const content = ta?.value?.trim();
    if (!content) {
      setStatus('请先输入闪念笔记内容');
      return;
    }
    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_NOTE',
      payload: {
        content,
        sourceUrl: activeTabInfo.url,
        sourceTitle: activeTabInfo.title
      }
    });
    if (res?.ok) {
      ta.value = '';
      setStatus('闪念笔记已保存');
      const dash = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' });
      if (dash?.ok) {
        appState.notes = dash.notes;
        renderStateToPopup();
      }
    }
  });
}

async function initPopup() {
  installViewportObserver((vp) => {
    const el = document.getElementById('vp-indicator');
    if (el) el.textContent = vp.layout === 'wide' ? '宽屏' : '手机';
  });

  bindPopupEvents();

  const res = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' });
  if (res?.ok) {
    appState = { ...appState, ...res };
    renderStateToPopup();
  }
  await probeActiveTabContext();
}

initPopup();
