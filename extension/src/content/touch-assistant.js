// 谜盒·划词笔记 网页端触控灵动胶囊 & 移动端长按划词 AI 浮条（Content Script）
// 专为小米浏览器（手机 / Pad）设计：
// 1. 动态测量 pageWidth 与 layout (compact / wide)
// 2. 监听 storage.onChanged 实时同步全局护眼阅读模式与字号
// 3. 提供手机/Pad 手指划词浮条（存笔记 / AI 精读 / 双语对照 / 复制）与贴边灵动胶囊抽屉

(() => {
  if (window.__MIBOX_XIAOMI_CONTENT_LOADED__) return;
  window.__MIBOX_XIAOMI_CONTENT_LOADED__ = true;

  const STORAGE_KEYS = {
    SETTINGS: 'mb_settings_v1',
    READING: 'mb_reading_v1'
  };

  let currentReading = { mode: 'off', fontScale: 100, showReadingBadge: true };
  let currentSettings = { touchCapsuleEnabled: true, selectionBarEnabled: true };
  let lastSelectedText = '';
  let shadowRoot = null;
  let hostEl = null;

  function measureViewport() {
    const pageWidth = document.documentElement.clientWidth || window.innerWidth || 360;
    const screenShortSide = typeof screen !== 'undefined' && screen.width && screen.height
      ? Math.min(screen.width, screen.height)
      : pageWidth;
    const layout = pageWidth >= 600 ? 'wide' : 'compact';
    return { pageWidth, screenShortSide, layout };
  }

  function estimateReadingMinutes() {
    const text = (document.body?.innerText || '').replace(/\s+/g, '');
    return Math.max(1, Math.ceil(text.length / 480));
  }

  function applyReadingAttributes(reading) {
    if (!reading) return;
    currentReading = { ...currentReading, ...reading };
    const mode = currentReading.mode;
    if (mode && mode !== 'off') {
      document.documentElement.setAttribute('data-mb-reading-mode', mode);
    } else {
      document.documentElement.removeAttribute('data-mb-reading-mode');
    }
    const scale = Number(currentReading.fontScale) || 100;
    if (scale !== 100) {
      document.documentElement.setAttribute('data-mb-font-scale', String(scale));
    } else {
      document.documentElement.removeAttribute('data-mb-font-scale');
    }
    updateCapsuleLabel();
  }

  function ensureShadowUi() {
    if (shadowRoot && document.body?.contains(hostEl)) return shadowRoot;
    hostEl = document.createElement('aside');
    hostEl.id = 'mibox-xiaomi-touch-host';
    hostEl.style.cssText = 'all: initial; position: fixed; z-index: 2147483646; pointer-events: none; inset: 0;';
    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        font-family: -apple-system, BlinkMacSystemFont, "MiSans", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: #1e293b;
      }
      * { box-sizing: border-box; }
      .mb-capsule {
        pointer-events: auto;
        position: fixed;
        right: 10px;
        bottom: 86px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 44px;
        padding: 8px 13px;
        border-radius: 999px;
        background: linear-gradient(135deg, #ff6900 0%, #e05300 100%);
        color: #ffffff;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 8px 22px rgba(255, 105, 0, 0.34), 0 0 0 1px rgba(255,255,255,0.22) inset;
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.18s ease, opacity 0.18s ease;
      }
      .mb-capsule:active {
        transform: scale(0.95);
      }
      .mb-capsule.hidden {
        display: none !important;
      }
      .mb-capsule-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 0 6px #fff;
      }
      .mb-sel-bar {
        pointer-events: auto;
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(12px);
        color: #f8fafc;
        box-shadow: 0 14px 34px rgba(2, 6, 23, 0.45), 0 0 0 1px rgba(255,255,255,0.12);
        max-width: min(94vw, 460px);
        overflow-x: auto;
      }
      .mb-sel-bar.visible {
        display: flex;
      }
      .mb-sel-btn {
        appearance: none;
        border: none;
        background: rgba(255,255,255,0.1);
        color: #ffffff;
        min-height: 44px;
        padding: 0 12px;
        border-radius: 11px;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .mb-sel-btn.primary {
        background: #ff6900;
        color: #fff;
      }
      .mb-sel-btn:active {
        opacity: 0.85;
      }
      .mb-drawer-backdrop {
        pointer-events: auto;
        position: fixed;
        inset: 0;
        background: rgba(2, 6, 23, 0.45);
        display: none;
        align-items: flex-end;
        justify-content: center;
      }
      .mb-drawer-backdrop.open {
        display: flex;
      }
      .mb-drawer {
        width: 100%;
        max-width: 560px;
        max-height: 82vh;
        background: #ffffff;
        color: #0f172a;
        border-radius: 22px 22px 0 0;
        padding: 16px 16px 22px;
        box-shadow: 0 -12px 40px rgba(15, 23, 42, 0.25);
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow-y: auto;
      }
      .mb-drawer[data-dark="true"] {
        background: #141923;
        color: #f1f5f9;
      }
      .mb-drawer-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .mb-drawer-title {
        font-size: 16px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mb-tag {
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 999px;
        background: rgba(255, 105, 0, 0.14);
        color: #ea580c;
        font-weight: 600;
      }
      .mb-close-btn {
        min-width: 44px;
        min-height: 44px;
        border-radius: 12px;
        border: none;
        background: rgba(148, 163, 184, 0.16);
        color: inherit;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
      }
      .mb-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .mb-mode-row {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
      }
      .mb-btn {
        min-height: 44px;
        padding: 8px 12px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: rgba(248, 250, 252, 0.9);
        color: #0f172a;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .mb-drawer[data-dark="true"] .mb-btn {
        background: #1e2636;
        color: #f1f5f9;
        border-color: rgba(255,255,255,0.12);
      }
      .mb-btn.active, .mb-btn.accent {
        background: #ff6900 !important;
        color: #ffffff !important;
        border-color: #ff6900 !important;
      }
      .mb-search-row {
        display: flex;
        gap: 8px;
      }
      .mb-input {
        flex: 1;
        min-height: 44px;
        padding: 0 12px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: transparent;
        color: inherit;
        font-size: 14px;
      }
      .mb-output {
        padding: 12px;
        border-radius: 14px;
        background: rgba(241, 245, 249, 0.85);
        font-size: 13px;
        line-height: 1.65;
        white-space: pre-wrap;
        max-height: 240px;
        overflow-y: auto;
      }
      .mb-drawer[data-dark="true"] .mb-output {
        background: #0f131b;
        color: #e2e8f0;
      }
      .mb-toast {
        pointer-events: none;
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 16px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.94);
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.28);
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      .mb-toast.show {
        opacity: 1;
      }
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="mb-toast" id="mb-toast"></div>
      <button type="button" class="mb-capsule" id="mb-capsule" aria-label="打开谜盒">
        <span class="mb-capsule-dot"></span>
        <span id="mb-capsule-text">谜盒 · 1分</span>
      </button>
      <div class="mb-sel-bar" id="mb-sel-bar" role="toolbar" aria-label="划词操作">
        <button type="button" class="mb-sel-btn primary" data-act="clip">存笔记</button>
        <button type="button" class="mb-sel-btn" data-act="explain">解释</button>
        <button type="button" class="mb-sel-btn" data-act="translate">翻译</button>
        <button type="button" class="mb-sel-btn" data-act="copy">复制</button>
      </div>
      <div class="mb-drawer-backdrop" id="mb-backdrop">
        <section class="mb-drawer" id="mb-drawer" role="dialog" aria-label="谜盒">
          <div class="mb-drawer-head">
            <div class="mb-drawer-title">
              <span>谜盒</span>
              <span class="mb-tag" id="mb-vp-badge">手机 compact</span>
            </div>
            <button type="button" class="mb-close-btn" id="mb-close-drawer" aria-label="关闭">✕</button>
          </div>
          <div class="mb-grid">
            <button type="button" class="mb-btn accent" id="mb-act-bookmark">收藏本页</button>
            <button type="button" class="mb-btn" id="mb-act-summary">本页要点</button>
          </div>
          <div>
            <div style="font-size:12px;opacity:0.75;margin-bottom:6px;">阅读模式（所有网页同步）：</div>
            <div class="mb-mode-row" id="mb-mode-row">
              <button type="button" class="mb-btn" data-mode="off">原生</button>
              <button type="button" class="mb-btn" data-mode="warm">暖纸</button>
              <button type="button" class="mb-btn" data-mode="dark">夜读</button>
              <button type="button" class="mb-btn" data-mode="eink">墨水屏</button>
            </div>
          </div>
          <div class="mb-search-row">
            <input type="search" class="mb-input" id="mb-qa-input" placeholder="搜索收藏和笔记，? 开头可提问" />
            <button type="button" class="mb-btn accent" id="mb-qa-btn">搜索</button>
          </div>
          <div class="mb-output" id="mb-drawer-output">点「本页要点」看这篇讲了什么；也可以直接在网页上长按选字。</div>
        </section>
      </div>
    `;

    shadowRoot.append(style, wrapper);
    (document.body || document.documentElement).appendChild(hostEl);
    bindShadowEvents();
    updateCapsuleLabel();
    return shadowRoot;
  }

  function showToast(msg) {
    ensureShadowUi();
    const t = shadowRoot.getElementById('mb-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function updateCapsuleLabel() {
    if (!shadowRoot) return;
    const capsule = shadowRoot.getElementById('mb-capsule');
    const textEl = shadowRoot.getElementById('mb-capsule-text');
    const vpBadge = shadowRoot.getElementById('mb-vp-badge');
    const drawer = shadowRoot.getElementById('mb-drawer');
    if (!capsule || !textEl) return;

    if (currentSettings.touchCapsuleEnabled === false || currentReading.showReadingBadge === false) {
      capsule.classList.add('hidden');
    } else {
      capsule.classList.remove('hidden');
    }

    const mins = estimateReadingMinutes();
    const modeLabel =
      currentReading.mode === 'warm'
        ? '·暖纸'
        : currentReading.mode === 'dark'
          ? '·夜读'
          : currentReading.mode === 'eink'
            ? '·墨水'
            : '';
    textEl.textContent = `谜盒 · ${mins}分${modeLabel}`;

    const vp = measureViewport();
    if (vpBadge) {
      vpBadge.textContent = `${vp.layout === 'wide' ? '宽屏/Pad' : '紧凑/手机'} ${vp.pageWidth}px`;
    }
    if (drawer) {
      drawer.setAttribute('data-dark', String(currentReading.mode === 'dark'));
    }
    const modeBtns = shadowRoot.querySelectorAll('#mb-mode-row [data-mode]');
    modeBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === currentReading.mode);
    });
  }

  function formatCleanOutput(md) {
    return String(md || '')
      .replace(/^###\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  function openDrawerWithOutput(text) {
    ensureShadowUi();
    updateCapsuleLabel();
    const backdrop = shadowRoot.getElementById('mb-backdrop');
    const out = shadowRoot.getElementById('mb-drawer-output');
    if (text && out) out.textContent = formatCleanOutput(text);
    if (backdrop) backdrop.classList.add('open');
  }

  function bindShadowEvents() {
    const capsule = shadowRoot.getElementById('mb-capsule');
    const backdrop = shadowRoot.getElementById('mb-backdrop');
    const closeBtn = shadowRoot.getElementById('mb-close-drawer');
    const bmBtn = shadowRoot.getElementById('mb-act-bookmark');
    const sumBtn = shadowRoot.getElementById('mb-act-summary');
    const qaBtn = shadowRoot.getElementById('mb-qa-btn');
    const qaInput = shadowRoot.getElementById('mb-qa-input');
    const selBar = shadowRoot.getElementById('mb-sel-bar');
    const out = shadowRoot.getElementById('mb-drawer-output');

    capsule.addEventListener('click', () => {
      openDrawerWithOutput();
    });

    closeBtn.addEventListener('click', () => {
      backdrop.classList.remove('open');
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });

    shadowRoot.querySelectorAll('#mb-mode-row [data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        applyReadingAttributes({ mode });
        chrome.runtime.sendMessage({ type: 'SAVE_READING_MODE', mode }, (res) => {
          if (res?.ok) {
            showToast(`已切换为「${btn.textContent}」`);
          }
        });
      });
    });

    bmBtn.addEventListener('click', () => {
      const payload = {
        title: document.title,
        url: location.href,
        text: (document.body?.innerText || '').slice(0, 2000)
      };
      chrome.runtime.sendMessage({ type: 'COLLECT_BOOKMARK', payload }, (res) => {
        if (res?.ok) {
          out.textContent = `已收藏《${res.item.title}》\n分组：${res.item.group}\n标签：${(res.item.tags || []).join(' · ')}\nAI 简介：${res.item.brief}`;
          showToast(res.isNew ? '已收藏' : '已更新收藏');
        }
      });
    });

    sumBtn.addEventListener('click', () => {
      out.textContent = '正在提取本页要点…';
      chrome.runtime.sendMessage(
        {
          type: 'AI_ANALYZE',
          taskMode: 'summary',
          pageContext: {
            title: document.title,
            url: location.href,
            text: (document.body?.innerText || '').slice(0, 5000)
          }
        },
        (res) => {
          if (res?.ok) {
            out.textContent = formatCleanOutput(res.text);
          } else {
            out.textContent = '提炼失败，请稍后重试。';
          }
        }
      );
    });

    const runQa = () => {
      const query = qaInput.value.trim();
      if (!query) return;
      out.textContent = '正在搜索…';
      chrome.runtime.sendMessage({ type: 'KB_SEARCH_QA', query }, (res) => {
        if (res?.ok) {
          out.textContent = formatCleanOutput(res.answer);
        }
      });
    };

    qaBtn.addEventListener('click', runQa);
    qaInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runQa();
    });

    selBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      const text = lastSelectedText || String(window.getSelection?.() || '').trim();
      if (!text) return;

      selBar.classList.remove('visible');

      if (act === 'copy') {
        navigator.clipboard?.writeText?.(text).catch(() => {});
        showToast('已复制选中内容');
        return;
      }

      if (act === 'clip') {
        const content = [
          `> ${text}`,
          ``,
          `- 来源：[${document.title || location.hostname}](${location.href})`,
          `- 摘录时间：${new Date().toLocaleString('zh-CN')}`
        ].join('\n');
        chrome.runtime.sendMessage(
          {
            type: 'SAVE_NOTE',
            payload: {
              title: `摘录：${text.slice(0, 28)}${text.length > 28 ? '…' : ''}`,
              content,
              sourceUrl: location.href,
              sourceTitle: document.title
            }
          },
          (res) => {
            if (res?.ok) {
              showToast('已存为笔记');
            }
          }
        );
        return;
      }

      const taskMode = act === 'translate' ? 'selection-translate' : 'selection-explain';
      openDrawerWithOutput('正在分析选中段落…');
      chrome.runtime.sendMessage(
        {
          type: 'AI_ANALYZE',
          taskMode,
          pageContext: {
            title: document.title,
            url: location.href,
            selection: text,
            text: (document.body?.innerText || '').slice(0, 2500)
          }
        },
        (res) => {
          if (res?.ok && out) {
            out.textContent = res.text;
          }
        }
      );
    });
  }

  function handleSelectionChange() {
    if (currentSettings.selectionBarEnabled === false) return;
    const sel = String(window.getSelection?.() || '').trim();
    ensureShadowUi();
    const selBar = shadowRoot.getElementById('mb-sel-bar');
    if (!selBar) return;
    if (sel.length >= 4 && sel.length <= 1600) {
      lastSelectedText = sel;
      selBar.classList.add('visible');
    } else {
      selBar.classList.remove('visible');
    }
  }

  // 初始化读取 storage.local 并绑定 storage.onChanged 实时同步
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get([STORAGE_KEYS.READING, STORAGE_KEYS.SETTINGS], (data) => {
      if (data?.[STORAGE_KEYS.SETTINGS]) {
        currentSettings = { ...currentSettings, ...data[STORAGE_KEYS.SETTINGS] };
      }
      ensureShadowUi();
      if (data?.[STORAGE_KEYS.READING]) {
        applyReadingAttributes(data[STORAGE_KEYS.READING]);
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STORAGE_KEYS.READING]?.newValue) {
        applyReadingAttributes(changes[STORAGE_KEYS.READING].newValue);
      }
      if (changes[STORAGE_KEYS.SETTINGS]?.newValue) {
        currentSettings = { ...currentSettings, ...changes[STORAGE_KEYS.SETTINGS].newValue };
        updateCapsuleLabel();
      }
    });
  }

  // 响应来自 popup / sidepanel 的即时确认与正文抽取请求
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg?.type === 'APPLY_READING_MODE') {
        applyReadingAttributes({ mode: msg.mode, fontScale: msg.fontScale });
        sendResponse({
          ok: true,
          appliedMode: currentReading.mode,
          viewport: measureViewport()
        });
        return false;
      }
      if (msg?.type === 'EXTRACT_PAGE_CONTEXT') {
        sendResponse({
          ok: true,
          title: document.title,
          url: location.href,
          selection: String(window.getSelection?.() || '').trim(),
          text: (document.body?.innerText || '').slice(0, 6000),
          readingMinutes: estimateReadingMinutes(),
          viewport: measureViewport()
        });
        return false;
      }
      return false;
    });
  }

  document.addEventListener('mouseup', () => setTimeout(handleSelectionChange, 40), { passive: true });
  document.addEventListener('touchend', () => setTimeout(handleSelectionChange, 120), { passive: true });
  window.addEventListener('resize', () => updateCapsuleLabel(), { passive: true });
})();
