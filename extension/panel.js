// 谜盒·伴读抽屉面板逻辑（兼容小米浏览器手机端底部抽屉与 Pad 端分屏侧栏）

import {
  installViewportObserver,
  applySkinToDocument,
  escapeHtml,
  extractDomain,
  formatTimeAgo
} from './src/shared/viewport.js';

let currentTab = {
  id: null,
  title: '小米浏览器当前阅读页',
  url: 'https://vibe-coding.browser.miui.com/rules',
  text: ''
};

async function refreshActiveTabContext() {
  if (!chrome.tabs?.query) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    currentTab.id = tab.id;
    currentTab.title = tab.title || currentTab.title;
    currentTab.url = tab.url || currentTab.url;

    const sub = document.getElementById('pn-tab-title');
    if (sub) sub.textContent = `${currentTab.title.slice(0, 34)} (${extractDomain(currentTab.url)})`;

    if (Number.isInteger(tab.id) && tab.id > 0 && /^https?:\/\//i.test(currentTab.url)) {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_CONTEXT' });
        if (res?.ok) {
          currentTab.title = res.title || currentTab.title;
          currentTab.text = res.text || '';
          return;
        }
      } catch {}

      if (chrome.scripting?.executeScript) {
        try {
          const [inj] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({
              title: document.title,
              url: location.href,
              text: (document.body?.innerText || '').slice(0, 5000)
            })
          });
          if (inj?.result) {
            currentTab.title = inj.result.title || currentTab.title;
            currentTab.text = inj.result.text || '';
          }
        } catch {}
      }
    }
  } catch {}
}

async function loadStateAndRenderRecall() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' });
  if (!res?.ok) return;
  applySkinToDocument(res.settings?.skin || 'xiaomi-orange');

  const bms = res.bookmarks || [];
  const notes = res.notes || [];
  const countBadge = document.getElementById('pn-total-count');
  if (countBadge) countBadge.textContent = `收藏 ${bms.length} · 笔记 ${notes.length}`;

  const listEl = document.getElementById('pn-recall-list');
  if (!listEl) return;

  const combined = [
    ...notes.slice(0, 3).map((n) => ({
      badge: '📝 笔记',
      title: n.title,
      desc: (n.content || '').replace(/\s+/g, ' ').slice(0, 86),
      time: formatTimeAgo(n.updatedAt)
    })),
    ...bms.slice(0, 3).map((b) => ({
      badge: '🔖 收藏',
      title: b.title,
      desc: b.brief || b.url,
      time: formatTimeAgo(b.updatedAt)
    }))
  ];

  listEl.innerHTML = combined
    .map(
      (item) => `
      <div class="pn-recall-card">
        <div style="display:flex;justify-content:space-between;font-size:11px;opacity:0.75;">
          <span>${escapeHtml(item.badge)}</span>
          <span>${escapeHtml(item.time)}</span>
        </div>
        <b>${escapeHtml(item.title)}</b>
        <span>${escapeHtml(item.desc)}</span>
      </div>
    `
    )
    .join('');
}

async function runCompanionAi(taskMode, customPrompt = '') {
  const box = document.getElementById('pn-ai-stream');
  if (box) box.textContent = '⏳ 正在由 Xiaomi MiMo + 本地双核引擎生成伴读分析…';
  await refreshActiveTabContext();

  if (customPrompt.startsWith('?') || customPrompt.startsWith('？')) {
    const qa = await chrome.runtime.sendMessage({
      type: 'KB_SEARCH_QA',
      query: customPrompt
    });
    if (qa?.ok && box) box.textContent = qa.answer;
    return;
  }

  const res = await chrome.runtime.sendMessage({
    type: 'AI_ANALYZE',
    taskMode,
    prompt: customPrompt,
    pageContext: {
      title: currentTab.title,
      url: currentTab.url,
      text: currentTab.text
    }
  });
  if (res?.ok && box) {
    box.textContent = res.text;
  }
}

function bindPanelEvents() {
  document.getElementById('pn-open-full')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
  });

  document.getElementById('pn-btn-refresh-page')?.addEventListener('click', async () => {
    await refreshActiveTabContext();
    const st = document.getElementById('pn-status-text');
    if (st) st.textContent = `已同步：${currentTab.title.slice(0, 24)}`;
  });

  document.querySelectorAll('.pn-quick-chips [data-prompt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      runCompanionAi(btn.getAttribute('data-prompt'));
    });
  });

  const handleAsk = () => {
    const input = document.getElementById('pn-ask-input');
    const q = input?.value?.trim() || '';
    if (!q) {
      runCompanionAi('summary');
      return;
    }
    if (q.startsWith('?') || q.startsWith('？')) {
      runCompanionAi('kb-qa', q);
    } else {
      runCompanionAi('selection-explain', q);
    }
  };

  document.getElementById('pn-btn-ask')?.addEventListener('click', handleAsk);
  document.getElementById('pn-ask-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAsk();
  });

  document.getElementById('pn-btn-quote')?.addEventListener('click', async () => {
    await refreshActiveTabContext();
    const ta = document.getElementById('pn-note-body');
    if (!ta) return;
    const quote = `\n> 来源：[${currentTab.title}](${currentTab.url})\n> 时间：${new Date().toLocaleString('zh-CN')}\n`;
    ta.value = `${ta.value}${quote}`;
  });

  document.getElementById('pn-btn-polish')?.addEventListener('click', async () => {
    const ta = document.getElementById('pn-note-body');
    const raw = ta?.value?.trim() || document.getElementById('pn-ai-stream')?.textContent || '';
    if (!raw) return;
    const st = document.getElementById('pn-status-text');
    if (st) st.textContent = '⏳ 正在结构化润色并提取待办…';
    const res = await chrome.runtime.sendMessage({
      type: 'AI_ANALYZE',
      taskMode: 'polish-note',
      prompt: raw,
      pageContext: { title: currentTab.title, url: currentTab.url }
    });
    if (res?.ok && ta) {
      ta.value = res.text;
      if (st) st.textContent = '✨ 已完成 AI 结构化润色';
    }
  });

  document.getElementById('pn-btn-save-note')?.addEventListener('click', async () => {
    const titleEl = document.getElementById('pn-note-title');
    const bodyEl = document.getElementById('pn-note-body');
    const st = document.getElementById('pn-status-text');
    const content = bodyEl?.value?.trim() || '';
    if (!content) {
      if (st) st.textContent = '⚠️ 请先输入笔记内容';
      return;
    }
    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_NOTE',
      payload: {
        title: titleEl?.value?.trim() || '',
        content,
        sourceUrl: currentTab.url,
        sourceTitle: currentTab.title
      }
    });
    if (res?.ok) {
      if (titleEl) titleEl.value = '';
      if (bodyEl) bodyEl.value = '';
      if (st) st.textContent = `✅ 已归档《${res.item.title}》`;
      await loadStateAndRenderRecall();
    }
  });
}

async function initPanel() {
  installViewportObserver((vp) => {
    const badge = document.getElementById('pn-vp-badge');
    if (badge) {
      badge.textContent = `${vp.layout === 'wide' ? 'Pad 宽屏侧栏' : '手机底部抽屉'} · ${vp.pageWidth}px`;
    }
  });
  bindPanelEvents();
  await refreshActiveTabContext();
  await loadStateAndRenderRecall();
}

initPanel();
