// 谜盒·划词笔记 全屏工作台主控制器（小米浏览器手机 compact / Pad wide 双端自适应）

import {
  SKINS,
  READING_MODES,
  installViewportObserver,
  applySkinToDocument,
  escapeHtml,
  formatTimeAgo,
  extractDomain
} from './src/shared/viewport.js';
import { AI_PRESETS } from './src/shared/ai-engine.js';
import { exportKnowledgeBundle } from './src/shared/storage-repo.js';

let state = {
  settings: {
    skin: 'xiaomi-orange',
    touchCapsuleEnabled: true,
    selectionBarEnabled: true,
    ai: {
      presetId: 'xiaomi-mimo',
      protocol: 'openai',
      baseUrl: 'https://api.mimo.mi.com/v1',
      model: 'mimo-v2.6',
      apiKey: ''
    }
  },
  reading: { mode: 'off', fontScale: 100 },
  dnr: { enabled: false, blockedDomains: ['doubleclick.net', 'googlesyndication.com'] },
  bookmarks: [],
  notes: [],
  vault: { initialized: false, unlocked: false, items: [] },
  activeGroup: '全部',
  bmQuery: '',
  noteQuery: ''
};

let clipboardClearTimer = null;

function notifyToast(text) {
  const el = document.getElementById('app-toast-msg');
  if (el) el.textContent = text;
}

/**
 * 轻量级安全 Markdown 渲染器（无 innerHTML 脚本注入风险）
 */
function renderSafeMarkdown(mdText) {
  const lines = String(mdText || '').split('\n');
  const html = [];
  let inCode = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        html.push('<pre><code>');
      } else {
        inCode = false;
        html.push('</code></pre>');
      }
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(raw) + '\n');
      continue;
    }
    if (!line.trim()) continue;
    if (line.startsWith('### ')) {
      html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith('> ')) {
      html.push(`<blockquote>${escapeHtml(line.slice(2))}</blockquote>`);
    } else if (line.startsWith('- [x] ') || line.startsWith('- [X] ')) {
      html.push(`<div><s>${escapeHtml(line.slice(6))}</s></div>`);
    } else if (line.startsWith('- [ ] ')) {
      html.push(`<div>⬜ ${escapeHtml(line.slice(6))}</div>`);
    } else if (line.startsWith('- ')) {
      html.push(`<div>• ${escapeHtml(line.slice(2))}</div>`);
    } else {
      const formatted = escapeHtml(line)
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      html.push(`<p style="margin:4px 0;">${formatted}</p>`);
    }
  }
  if (inCode) html.push('</code></pre>');
  return html.join('');
}

function switchView(viewName) {
  document.querySelectorAll('#app-nav-items .nav-btn').forEach((btn) => {
    const v = btn.getAttribute('data-view');
    btn.classList.toggle('active', v === viewName || (v === 'ai' && (viewName === 'vault' || viewName === 'contest')));
  });
  document.querySelectorAll('.app-view').forEach((v) => {
    v.classList.toggle('active', v.id === `view-${viewName}`);
  });
  if (viewName === 'contest') {
    refreshSelfCheckMatrix();
  }
}

function renderTopbarSkins() {
  const box = document.getElementById('topbar-skin-pills');
  if (!box) return;
  const activeSkin = state.settings?.skin || 'xiaomi-orange';
  applySkinToDocument(activeSkin);

  box.innerHTML = SKINS.map(
    (s) => `
    <button type="button" class="skin-chip ${s.id === activeSkin ? 'active' : ''}" data-skin="${s.id}">
      <span style="width:10px;height:10px;border-radius:50%;background:${s.accent};display:inline-block;"></span>
      <span>${escapeHtml(s.name)}</span>
    </button>
  `
  ).join('');

  box.querySelectorAll('[data-skin]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const skinId = btn.getAttribute('data-skin');
      const res = await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        settings: { skin: skinId }
      });
      if (res?.ok) {
        state.settings = res.settings;
        renderTopbarSkins();
        notifyToast(`已切换主题色：${skinId}`);
      }
    });
  });
}

function renderHomeView() {
  document.getElementById('home-stat-bm').textContent = String(state.bookmarks.length);
  document.getElementById('home-stat-note').textContent = String(state.notes.length);
  document.getElementById('home-stat-vault').textContent = state.vault?.unlocked
    ? `已解锁(${state.vault.count || 0})`
    : 'AES-256';

  const modeObj = READING_MODES.find((m) => m.id === state.reading?.mode) || READING_MODES[0];
  const rBadge = document.getElementById('home-reading-badge');
  if (rBadge) rBadge.textContent = `当前：${modeObj.name}`;

  document.querySelectorAll('#home-reading-modes [data-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === state.reading?.mode);
  });

  const dnrBtn = document.getElementById('home-btn-dnr');
  if (dnrBtn) {
    const on = Boolean(state.dnr?.enabled);
    dnrBtn.textContent = on ? '屏蔽广告图片：已开启' : '屏蔽广告图片：未开启';
    dnrBtn.classList.toggle('primary', on);
  }

  // 星标收藏
  const starBox = document.getElementById('home-starred-bookmarks');
  const starred = state.bookmarks.filter((b) => b.starred).slice(0, 4);
  const displayBms = starred.length ? starred : state.bookmarks.slice(0, 4);
  if (starBox) {
    starBox.innerHTML = displayBms
      .map(
        (b) => `
      <div class="bm-card">
        <div class="bm-card-top">
          <a class="bm-card-title" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">${escapeHtml(b.title)}</a>
          <span class="mb-pill">${escapeHtml(b.group || '精选')}</span>
        </div>
        <div class="bm-card-brief">${escapeHtml(b.brief || '')}</div>
        <div class="bm-card-foot">
          <span>${escapeHtml(b.domain || extractDomain(b.url))} · 约 ${b.readingMinutes || 3} 分钟</span>
          <span>${(b.tags || []).map((t) => `#${escapeHtml(t)}`).join(' ')}</span>
        </div>
      </div>
    `
      )
      .join('');
  }

  // 近期笔记
  const noteBox = document.getElementById('home-recent-notes');
  if (noteBox) {
    noteBox.innerHTML = state.notes
      .slice(0, 3)
      .map(
        (n) => `
      <div class="note-card">
        <div class="bm-card-top">
          <b>${escapeHtml(n.title)}</b>
          <span style="font-size:11px;color:var(--mb-text-muted);">${escapeHtml(formatTimeAgo(n.updatedAt))}</span>
        </div>
        <div class="note-md-body">${renderSafeMarkdown((n.content || '').slice(0, 220))}</div>
      </div>
    `
      )
      .join('');
  }
}

function renderBookmarksView() {
  const groups = ['全部', '星标精选', ...new Set(state.bookmarks.map((b) => b.group || '精选收藏'))];
  const chipBox = document.getElementById('bm-group-chips');
  if (chipBox) {
    chipBox.innerHTML = groups
      .map(
        (g) => `
      <button type="button" class="mb-touch-btn ${state.activeGroup === g ? 'primary' : ''}" data-group="${escapeHtml(g)}" style="min-height:38px;padding:6px 12px;font-size:12.5px;">
        ${escapeHtml(g)}
      </button>
    `
      )
      .join('');
    chipBox.querySelectorAll('[data-group]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeGroup = btn.getAttribute('data-group');
        renderBookmarksView();
      });
    });
  }

  const q = state.bmQuery.toLowerCase();
  const filtered = state.bookmarks.filter((b) => {
    if (state.activeGroup === '星标精选' && !b.starred) return false;
    if (state.activeGroup !== '全部' && state.activeGroup !== '星标精选' && b.group !== state.activeGroup) {
      return false;
    }
    if (!q) return true;
    return `${b.title} ${b.brief} ${b.url} ${(b.tags || []).join(' ')}`.toLowerCase().includes(q);
  });

  const container = document.getElementById('bm-cards-container');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="mb-card">暂无匹配的收藏记录，点击右上角「＋ 新增智能收藏」即可体验 AI 自动摘要与分类。</div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (b) => `
    <article class="bm-card">
      <div class="bm-card-top">
        <a class="bm-card-title" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">${escapeHtml(b.title)}</a>
        <div class="btn-group">
          <button type="button" class="bm-mini-btn" data-star="${escapeHtml(b.id)}" title="切换星标">${b.starred ? '★' : '☆'}</button>
          <button type="button" class="bm-mini-btn" data-del-bm="${escapeHtml(b.id)}" title="删除收藏">删除</button>
        </div>
      </div>
      <div class="bm-card-brief">${escapeHtml(b.brief || '')}</div>
      <div class="bm-card-foot">
        <div class="bm-tags">
          <span class="mb-pill">${escapeHtml(b.group || '精选')}</span>
          ${(b.tags || []).map((t) => `<span class="mb-pill">#${escapeHtml(t)}</span>`).join('')}
        </div>
        <span>${escapeHtml(b.domain || extractDomain(b.url))} · ${escapeHtml(formatTimeAgo(b.updatedAt))}</span>
      </div>
    </article>
  `
    )
    .join('');

  container.querySelectorAll('[data-star]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await chrome.runtime.sendMessage({
        type: 'TOGGLE_BOOKMARK_STAR',
        id: btn.getAttribute('data-star')
      });
      if (res?.ok) {
        state.bookmarks = res.bookmarks;
        renderBookmarksView();
        renderHomeView();
      }
    });
  });

  container.querySelectorAll('[data-del-bm]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await chrome.runtime.sendMessage({
        type: 'DELETE_BOOKMARK',
        id: btn.getAttribute('data-del-bm')
      });
      if (res?.ok) {
        state.bookmarks = res.bookmarks;
        renderBookmarksView();
        renderHomeView();
        notifyToast('已删除该条收藏');
      }
    });
  });
}

function renderNotesView() {
  const q = state.noteQuery.toLowerCase();
  const filtered = state.notes.filter((n) => {
    if (!q) return true;
    return `${n.title} ${n.content} ${(n.tags || []).join(' ')}`.toLowerCase().includes(q);
  });

  const container = document.getElementById('notes-list-container');
  if (!container) return;

  container.innerHTML = filtered
    .map(
      (n) => `
    <article class="note-card">
      <div class="bm-card-top">
        <b>${escapeHtml(n.title)}</b>
        <div class="btn-group">
          <button type="button" class="bm-mini-btn" data-edit-note="${escapeHtml(n.id)}" title="载入编辑器">✏️</button>
          <button type="button" class="bm-mini-btn" data-del-note="${escapeHtml(n.id)}" title="删除笔记">删除</button>
        </div>
      </div>
      <div class="note-md-body">${renderSafeMarkdown(n.content)}</div>
      ${
        n.screenshotDataUrl
          ? `<img class="note-shot-img" src="${escapeHtml(n.screenshotDataUrl)}" alt="网页可见区域截图" />`
          : ''
      }
      <div class="bm-card-foot">
        <div class="bm-tags">
          ${(n.tags || []).map((t) => `<span class="mb-pill">#${escapeHtml(t)}</span>`).join('')}
        </div>
        <span>${n.sourceUrl ? escapeHtml(extractDomain(n.sourceUrl)) + ' · ' : ''}${escapeHtml(formatTimeAgo(n.updatedAt))}</span>
      </div>
    </article>
  `
    )
    .join('');

  container.querySelectorAll('[data-edit-note]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const note = state.notes.find((x) => x.id === btn.getAttribute('data-edit-note'));
      if (!note) return;
      document.getElementById('note-edit-id').value = note.id;
      document.getElementById('note-input-title').value = note.title || '';
      document.getElementById('note-input-url').value = note.sourceUrl || '';
      document.getElementById('note-input-content').value = note.content || '';
      notifyToast(`已载入笔记《${note.title}》供编辑`);
    });
  });

  container.querySelectorAll('[data-del-note]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await chrome.runtime.sendMessage({
        type: 'DELETE_NOTE',
        id: btn.getAttribute('data-del-note')
      });
      if (res?.ok) {
        state.notes = res.notes;
        renderNotesView();
        renderHomeView();
        notifyToast('已删除该篇笔记');
      }
    });
  });
}

function renderVaultView() {
  const badge = document.getElementById('vault-state-badge');
  const initPanel = document.getElementById('vault-init-panel');
  const unlockPanel = document.getElementById('vault-unlock-panel');
  const unlockedPanel = document.getElementById('vault-unlocked-panel');

  initPanel?.classList.add('hidden');
  unlockPanel?.classList.add('hidden');
  unlockedPanel?.classList.add('hidden');

  if (!state.vault?.initialized) {
    if (badge) badge.textContent = '未初始化';
    initPanel?.classList.remove('hidden');
    return;
  }

  if (!state.vault?.unlocked) {
    if (badge) badge.textContent = '已锁定';
    unlockPanel?.classList.remove('hidden');
    return;
  }

  if (badge) badge.textContent = `已解锁 · ${state.vault.items?.length || 0} 条`;
  unlockedPanel?.classList.remove('hidden');

  const container = document.getElementById('vault-items-container');
  if (!container) return;

  const items = state.vault.items || [];
  container.innerHTML = items
    .map(
      (item) => `
    <article class="bm-card">
      <div class="bm-card-top">
        <b>${item.category === 'api-key' ? '' : item.category === 'secret-note' ? '' : ''} ${escapeHtml(item.title)}</b>
        <div class="btn-group">
          <button type="button" class="mb-touch-btn soft" data-copy-secret="${escapeHtml(item.id)}" style="min-height:36px;padding:4px 10px;font-size:12px;">复制密文</button>
          <button type="button" class="bm-mini-btn" data-del-vault="${escapeHtml(item.id)}">删除</button>
        </div>
      </div>
      <div class="bm-card-brief">
        账号/标识：<code>${escapeHtml(item.username || '未填')}</code> · 密文：<code>••••••••••••</code>
      </div>
      <div class="bm-card-foot">
        <span class="mb-pill">${escapeHtml(item.domain || '通用凭据')}</span>
        <span>AES-256-GCM 认证保护</span>
      </div>
    </article>
  `
    )
    .join('');

  container.querySelectorAll('[data-copy-secret]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = items.find((x) => x.id === btn.getAttribute('data-copy-secret'));
      if (!target) return;
      await navigator.clipboard?.writeText?.(target.secret || '').catch(() => {});
      const timerEl = document.getElementById('vault-clipboard-timer');
      let remain = 30;
      clearInterval(clipboardClearTimer);
      if (timerEl) timerEl.textContent = `已复制「${target.title}」密文，将在 ${remain} 秒后自动清空剪贴板`;
      clipboardClearTimer = setInterval(async () => {
        remain--;
        if (remain <= 0) {
          clearInterval(clipboardClearTimer);
          await navigator.clipboard?.writeText?.('').catch(() => {});
          if (timerEl) timerEl.textContent = '剪贴板已自动安全清空';
        } else if (timerEl) {
          timerEl.textContent = `已复制「${target.title}」密文，将在 ${remain} 秒后自动清空剪贴板`;
        }
      }, 1000);
    });
  });

  container.querySelectorAll('[data-del-vault]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await chrome.runtime.sendMessage({
        type: 'VAULT_DELETE_ITEM',
        id: btn.getAttribute('data-del-vault')
      });
      if (res?.ok) {
        state.vault = res.vault;
        renderVaultView();
        renderHomeView();
      }
    });
  });
}

function renderAiAndSettingsView() {
  const presetBox = document.getElementById('ai-preset-chips');
  const currentPreset = state.settings?.ai?.presetId || 'xiaomi-mimo';
  if (presetBox) {
    presetBox.innerHTML = AI_PRESETS.map(
      (p) => `
      <button type="button" class="mb-touch-btn ${p.id === currentPreset ? 'primary' : ''}" data-preset="${p.id}" style="min-height:40px;font-size:12.5px;">
        ${escapeHtml(p.name)}
      </button>
    `
    ).join('');

    presetBox.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = AI_PRESETS.find((x) => x.id === btn.getAttribute('data-preset'));
        if (!p) return;
        state.settings.ai = {
          ...state.settings.ai,
          presetId: p.id,
          protocol: p.protocol,
          baseUrl: p.baseUrl,
          model: p.model
        };
        renderAiAndSettingsView();
      });
    });
  }

  document.getElementById('ai-input-baseurl').value = state.settings?.ai?.baseUrl || 'https://api.mimo.mi.com/v1';
  document.getElementById('ai-input-model').value = state.settings?.ai?.model || 'mimo-v2.6';
  document.getElementById('ai-input-key').value = state.settings?.ai?.apiKey || '';

  document.getElementById('set-touch-capsule').checked = state.settings?.touchCapsuleEnabled !== false;
  document.getElementById('set-selection-bar').checked = state.settings?.selectionBarEnabled !== false;
  document.getElementById('set-dnr-enabled').checked = Boolean(state.dnr?.enabled);
  document.getElementById('set-dnr-domains').value = (state.dnr?.blockedDomains || []).join(', ');
}

async function refreshSelfCheckMatrix() {
  const box = document.getElementById('contest-check-matrix');
  if (!box) return;
  const res = await chrome.runtime.sendMessage({ type: 'RUN_SELF_CHECK' });
  if (!res?.ok) return;
  box.innerHTML = res.checks
    .map(
      (c) => `
    <div class="check-row">
      <div>
        <b>${escapeHtml(c.name)}</b>
        <span>${escapeHtml(c.spec)}</span>
      </div>
      <span class="mb-pill">${c.ok ? '通过' : '受限'}</span>
    </div>
  `
    )
    .join('');
}

function renderAll() {
  renderTopbarSkins();
  renderHomeView();
  renderBookmarksView();
  renderNotesView();
  renderVaultView();
  renderAiAndSettingsView();
}

function bindAppEvents() {
  // 导航栏切换
  document.querySelectorAll('#app-nav-items .nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
  });

  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.getAttribute('data-goto')));
  });

  // 首页全库检索与 `?` 直答
  const runHomeQa = async () => {
    const q = document.getElementById('home-qa-input')?.value?.trim() || '? 小米浏览器扩展支持哪些核心能力';
    const out = document.getElementById('home-qa-output');
    if (!out) return;
    out.classList.remove('hidden');
    out.textContent = '正在搜索…';
    const res = await chrome.runtime.sendMessage({ type: 'KB_SEARCH_QA', query: q });
    if (res?.ok) {
      out.innerHTML = renderSafeMarkdown(res.answer);
    }
  };
  document.getElementById('home-btn-qa')?.addEventListener('click', runHomeQa);
  document.getElementById('home-qa-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runHomeQa();
  });

  // 首页唤出伴读抽屉
  document.getElementById('home-btn-open-drawer')?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (chrome.sidePanel?.open && tab?.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
        return;
      }
    } catch {}
    await chrome.tabs.create({ url: chrome.runtime.getURL('panel.html') });
  });

  // 首页阅读模式切换
  document.querySelectorAll('#home-reading-modes [data-mode]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.getAttribute('data-mode');
      const res = await chrome.runtime.sendMessage({ type: 'SAVE_READING_MODE', mode });
      if (res?.ok) {
        state.reading = res.reading;
        renderHomeView();
        notifyToast(`阅读模式已切换，已打开的网页同步生效`);
      }
    });
  });

  // 首页 DNR 开关
  document.getElementById('home-btn-dnr')?.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({
      type: 'TOGGLE_DNR_PURIFY',
      enabled: !state.dnr?.enabled
    });
    if (res?.ok) {
      state.dnr = res.config;
      renderHomeView();
      renderAiAndSettingsView();
      notifyToast(state.dnr.enabled ? '已开启广告图片屏蔽' : '已关闭广告图片屏蔽');
    }
  });

  // 收藏夹新增表单
  const bmForm = document.getElementById('bm-add-form');
  document.getElementById('bm-btn-toggle-add')?.addEventListener('click', () => {
    bmForm?.classList.toggle('hidden');
  });
  document.getElementById('bm-btn-cancel-add')?.addEventListener('click', () => {
    bmForm?.classList.add('hidden');
  });

  bmForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('bm-input-url').value.trim();
    const title = document.getElementById('bm-input-title').value.trim();
    const brief = document.getElementById('bm-input-brief').value.trim();
    const res = await chrome.runtime.sendMessage({
      type: 'COLLECT_BOOKMARK',
      payload: { url, title, brief, text: brief }
    });
    if (res?.ok) {
      bmForm.reset();
      bmForm.classList.add('hidden');
      const dash = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' });
      if (dash?.ok) {
        state.bookmarks = dash.bookmarks;
        renderBookmarksView();
        renderHomeView();
        notifyToast(`已收藏到「${res.item.group}」`);
      }
    }
  });

  document.getElementById('bm-search-input')?.addEventListener('input', (e) => {
    state.bmQuery = e.target.value;
    renderBookmarksView();
  });

  // 笔记保存与 AI 润色
  document.getElementById('note-btn-save')?.addEventListener('click', async () => {
    const id = document.getElementById('note-edit-id').value.trim();
    const title = document.getElementById('note-input-title').value.trim();
    const sourceUrl = document.getElementById('note-input-url').value.trim();
    const content = document.getElementById('note-input-content').value.trim();
    if (!content) {
      notifyToast('请先填写笔记正文内容');
      return;
    }
    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_NOTE',
      payload: { id: id || undefined, title, sourceUrl, content }
    });
    if (res?.ok) {
      document.getElementById('note-edit-id').value = '';
      document.getElementById('note-input-title').value = '';
      document.getElementById('note-input-url').value = '';
      document.getElementById('note-input-content').value = '';
      const dash = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' });
      if (dash?.ok) {
        state.notes = dash.notes;
        renderNotesView();
        renderHomeView();
        notifyToast(`已保存笔记《${res.item.title}》`);
      }
    }
  });

  document.getElementById('note-btn-ai-polish')?.addEventListener('click', async () => {
    const ta = document.getElementById('note-input-content');
    const raw = ta?.value?.trim();
    if (!raw) {
      notifyToast('请先在编辑器中输入草稿文字');
      return;
    }
    notifyToast('正在整理…');
    const res = await chrome.runtime.sendMessage({
      type: 'AI_ANALYZE',
      taskMode: 'polish-note',
      prompt: raw,
      pageContext: { title: document.getElementById('note-input-title').value }
    });
    if (res?.ok && ta) {
      ta.value = res.text;
      notifyToast('已整理');
    }
  });

  document.getElementById('note-search-input')?.addEventListener('input', (e) => {
    state.noteQuery = e.target.value;
    renderNotesView();
  });

  // 保险箱初始化、解锁、恢复、锁定与新增
  document.getElementById('vault-btn-init')?.addEventListener('click', async () => {
    const pw = document.getElementById('vault-init-pw').value;
    const res = await chrome.runtime.sendMessage({ type: 'VAULT_INIT', password: pw });
    if (!res?.ok) {
      notifyToast(`${res?.error || '初始化失败'}`);
      return;
    }
    state.vault = res.vault;
    const banner = document.getElementById('vault-recovery-banner');
    const codeEl = document.getElementById('vault-recovery-code');
    if (banner && codeEl) {
      codeEl.textContent = res.recoveryKeyText;
      banner.classList.remove('hidden');
    }
    renderVaultView();
    renderHomeView();
    notifyToast('保险箱已创建');
  });

  document.getElementById('vault-btn-copy-recovery')?.addEventListener('click', () => {
    const code = document.getElementById('vault-recovery-code')?.textContent || '';
    navigator.clipboard?.writeText?.(code).catch(() => {});
    notifyToast('已复制 64 位恢复密钥');
  });

  document.getElementById('vault-btn-unlock')?.addEventListener('click', async () => {
    const pw = document.getElementById('vault-unlock-pw').value;
    const res = await chrome.runtime.sendMessage({ type: 'VAULT_UNLOCK', password: pw });
    if (!res?.ok) {
      notifyToast(`${res?.error || '主密码错误'}`);
      return;
    }
    document.getElementById('vault-unlock-pw').value = '';
    state.vault = res.vault;
    renderVaultView();
    renderHomeView();
    notifyToast('保险箱已解锁');
  });

  document.getElementById('vault-btn-reset')?.addEventListener('click', async () => {
    const recoveryKey = document.getElementById('vault-reset-rec').value.trim();
    const newPassword = document.getElementById('vault-reset-newpw').value;
    const res = await chrome.runtime.sendMessage({
      type: 'VAULT_RESET_BY_RECOVERY',
      recoveryKey,
      newPassword
    });
    if (!res?.ok) {
      notifyToast(`${res?.error || '恢复密钥重置失败'}`);
      return;
    }
    state.vault = res.vault;
    renderVaultView();
    renderHomeView();
    notifyToast('已通过恢复密钥重置主密码并解锁');
  });

  document.getElementById('vault-btn-lock')?.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'VAULT_LOCK' });
    if (res?.ok) {
      state.vault = res.vault;
      renderVaultView();
      renderHomeView();
      notifyToast('保险箱已锁定');
    }
  });

  document.getElementById('vault-btn-show-add')?.addEventListener('click', () => {
    document.getElementById('vault-add-form')?.classList.toggle('hidden');
  });

  document.getElementById('vault-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = {
      title: document.getElementById('vault-item-title').value.trim(),
      category: document.getElementById('vault-item-cat').value,
      domain: document.getElementById('vault-item-domain').value.trim(),
      username: document.getElementById('vault-item-user').value.trim(),
      secret: document.getElementById('vault-item-secret').value
    };
    const res = await chrome.runtime.sendMessage({ type: 'VAULT_SAVE_ITEM', item });
    if (res?.ok) {
      e.target.reset();
      e.target.classList.add('hidden');
      state.vault = res.vault;
      renderVaultView();
      renderHomeView();
      notifyToast('已加密保存');
    }
  });

  // AI 设置保存与测试
  document.getElementById('ai-btn-save')?.addEventListener('click', async () => {
    const ai = {
      ...state.settings.ai,
      baseUrl: document.getElementById('ai-input-baseurl').value.trim(),
      model: document.getElementById('ai-input-model').value.trim(),
      apiKey: document.getElementById('ai-input-key').value.trim()
    };
    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: { ai }
    });
    if (res?.ok) {
      state.settings = res.settings;
      notifyToast('已保存');
    }
  });

  document.getElementById('ai-btn-test')?.addEventListener('click', async () => {
    const out = document.getElementById('ai-test-output');
    if (!out) return;
    out.classList.remove('hidden');
    out.textContent = '正在测试…';
    const res = await chrome.runtime.sendMessage({
      type: 'AI_ANALYZE',
      taskMode: 'summary',
      pageContext: {
        title: '连接测试',
        url: 'https://vibe-coding.browser.miui.com/rules',
        text: '谜盒是一个小米浏览器扩展。在手机上长按选中网页文字，可以存笔记、解释或翻译。它还提供四种阅读模式，所有标签页同步切换。'
      }
    });
    if (res?.ok) {
      out.innerHTML = renderSafeMarkdown(`**当前激活引擎**：\`${res.model}\`\n\n${res.text}`);
    }
  });

  document.getElementById('set-btn-save-interaction')?.addEventListener('click', async () => {
    const touchCapsuleEnabled = document.getElementById('set-touch-capsule').checked;
    const selectionBarEnabled = document.getElementById('set-selection-bar').checked;
    const dnrEnabled = document.getElementById('set-dnr-enabled').checked;
    const blockedDomains = document
      .getElementById('set-dnr-domains')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const sRes = await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: { touchCapsuleEnabled, selectionBarEnabled }
    });
    if (sRes?.ok) state.settings = sRes.settings;

    const dRes = await chrome.runtime.sendMessage({
      type: 'TOGGLE_DNR_PURIFY',
      enabled: dnrEnabled,
      config: { blockedDomains }
    });
    if (dRes?.ok) state.dnr = dRes.config;

    renderHomeView();
    notifyToast('已保存');
  });

  // 参赛自检与手机/Pad 双端导出
  document.getElementById('contest-btn-recheck')?.addEventListener('click', refreshSelfCheckMatrix);

  const handleExport = async (fmt) => {
    const res = await exportKnowledgeBundle(fmt);
    const st = document.getElementById('contest-export-status');
    const preview = document.getElementById('contest-export-preview');
    if (st) st.textContent = res.statusMessage;
    if (preview) preview.value = res.text;
    notifyToast(res.statusMessage);
  };

  document.getElementById('contest-btn-export-json')?.addEventListener('click', () => handleExport('json'));
  document.getElementById('contest-btn-export-md')?.addEventListener('click', () => handleExport('markdown'));

  document.getElementById('contest-btn-copy-export')?.addEventListener('click', async () => {
    const preview = document.getElementById('contest-export-preview');
    if (!preview?.value) {
      await handleExport('json');
    }
    await navigator.clipboard?.writeText?.(preview.value).catch(() => {});
    notifyToast('已复制到剪贴板');
  });

  document.getElementById('contest-btn-reset-demo')?.addEventListener('click', async () => {
    if (!confirm('恢复示例数据会覆盖现有的收藏和笔记，确定继续？')) return;
    const res = await chrome.runtime.sendMessage({ type: 'RESET_DEMO_DATA' });
    if (res?.ok) {
      state.bookmarks = res.bookmarks;
      state.notes = res.notes;
      renderAll();
      notifyToast('已恢复示例数据');
    }
  });
}

async function initApp() {
  installViewportObserver((vp) => {
    const detail = document.getElementById('app-vp-detail');
    if (detail) {
      detail.textContent = `${vp.layout === 'wide' ? '宽屏' : '手机'} · ${vp.pageWidth}px`;
    }
  });

  bindAppEvents();

  const res = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' });
  if (res?.ok) {
    state = { ...state, ...res };
    renderAll();
  }
  await refreshSelfCheckMatrix();
}

initApp();
