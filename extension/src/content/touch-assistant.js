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
  let pressedSelection = '';
  let selectionFrame = 0;
  let viewportFrame = 0;
  let readingEstimate = null;
  let toastTimer;
  let shadowRoot = null;
  let hostEl = null;
  let pageStudio = null;

  function measureViewport() {
    const pageWidth = document.documentElement.clientWidth || window.innerWidth || 360;
    const screenShortSide = typeof screen !== 'undefined' && screen.width && screen.height
      ? Math.min(screen.width, screen.height)
      : pageWidth;
    const layout = pageWidth >= 600 ? 'wide' : 'compact';
    return { pageWidth, screenShortSide, layout };
  }

  function estimateReadingMinutes() {
    if (readingEstimate?.url !== location.href) {
      const text = (document.querySelector('article, main, [role="main"]') || document.body)
        ?.textContent || '';
      readingEstimate = {
        url: location.href,
        minutes: Math.max(1, Math.ceil(text.replace(/\s+/g, '').length / 480))
      };
    }
    return readingEstimate.minutes;
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
    if (shadowRoot && hostEl?.isConnected) return shadowRoot;
    hostEl = document.createElement('aside');
    hostEl.id = 'mibox-xiaomi-touch-host';
    hostEl.style.cssText = 'all: initial; position: fixed; z-index: 2147483646; pointer-events: none; inset: 0;';
    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "MiSans", "PingFang SC", sans-serif;
        color: #1c1c1e;
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
        font-size: 15px;
        line-height: 1.45;
        letter-spacing: -0.01em;
        --g-bg: #fcfcfd;
        --g-text: #1c1c1e;
        --g-muted: rgba(60, 60, 67, 0.6);
        --g-fill: rgba(118, 118, 128, 0.14);
        --g-accent: #b94300;
        --g-on-accent: #fff;
      }
      * { box-sizing: border-box; }
      .glass {
        background: var(--g-bg);
        border: 1px solid var(--g-fill);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14);
      }
      .mb-capsule {
        pointer-events: auto;
        position: fixed;
        right: calc(12px + var(--mb-viewport-right, 0px));
        bottom: calc(88px + var(--mb-viewport-lift, 0px));
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 44px;
        padding: 0 14px;
        border-radius: 999px;
        color: var(--g-text);
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: transform 120ms ease-out;
      }
      .mb-capsule:active { transform: scale(0.94); }
      .mb-capsule.hidden { display: none; }
      .mb-capsule-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--g-accent); }
      .mb-sel-bar {
        pointer-events: auto;
        position: fixed;
        left: var(--mb-viewport-center, 50%);
        bottom: calc(16px + max(env(safe-area-inset-bottom, 0px), var(--mb-viewport-lift, 0px)));
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 2px;
        padding: 5px;
        border-radius: 999px;
        max-width: min(calc(var(--mb-viewport-width, 100vw) - 16px), 420px);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .mb-sel-bar.visible { display: flex; animation: mb-pop 150ms ease-out; }
      @keyframes mb-pop {
        from { opacity: 0; transform: translateX(-50%) translateY(6px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      .mb-sel-btn {
        appearance: none;
        border: 0;
        background: transparent;
        color: var(--g-text);
        min-height: 44px;
        padding: 0 clamp(8px, 3.5vw, 16px);
        border-radius: 999px;
        font: inherit;
        font-size: 15px;
        font-weight: 500;
        white-space: nowrap;
        flex-shrink: 0;
        touch-action: manipulation;
        cursor: pointer;
      }
      .mb-sel-btn.primary { background: var(--g-accent); color: var(--g-on-accent); }
      .mb-sel-btn:active { background: var(--g-fill); }
      .mb-sel-btn.primary:active { filter: brightness(0.92); }
      .mb-drawer-backdrop {
        pointer-events: auto;
        position: fixed;
        inset: var(--mb-viewport-top, 0px) var(--mb-viewport-right, 0px) var(--mb-viewport-lift, 0px) var(--mb-viewport-left, 0px);
        display: none;
        align-items: flex-end;
        justify-content: center;
        background: rgba(0, 0, 0, 0.18);
      }
      .mb-drawer-backdrop.open { display: flex; }
      .mb-drawer {
        width: min(100%, 520px);
        max-height: min(82vh, calc(var(--mb-viewport-height, 100vh) - 16px));
        overflow-y: auto;
        overscroll-behavior: contain;
        margin: 0 8px calc(8px + env(safe-area-inset-bottom, 0px));
        padding: 18px 16px 16px;
        border-radius: 28px;
        background: var(--g-bg);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
        color: var(--g-text);
        display: flex;
        flex-direction: column;
        gap: 14px;
        animation: mb-up 180ms ease-out;
      }
      @keyframes mb-up { from { transform: translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }
      :host([data-mb-dark]) {
        --g-text: #f5f5f7;
        --g-muted: rgba(235, 235, 245, 0.6);
        --g-fill: rgba(118, 118, 128, 0.3);
        --g-bg: #22242a;
        --g-accent: #ff995e;
        --g-on-accent: #21130a;
      }
      .mb-drawer-head { display: flex; align-items: center; justify-content: space-between; }
      .mb-drawer-title { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 600; }
      .mb-close-btn {
        width: 44px; height: 44px; border: 0; border-radius: 50%;
        background: var(--g-fill); color: var(--g-muted); font-size: 13px; cursor: pointer;
      }
      .mb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .mb-feature-btn {
        display: grid;
        justify-items: start;
        gap: 2px;
        padding: 8px 12px;
        border-radius: 13px;
      }
      .mb-feature-btn > small { font-size: 11px; color: var(--g-muted); }
      .mb-mode-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
      .mb-btn {
        appearance: none;
        border: 0;
        min-height: 44px;
        padding: 0 12px;
        border-radius: 999px;
        background: var(--g-fill);
        color: var(--g-text);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .mb-btn.accent { background: var(--g-accent); color: var(--g-on-accent); }
      .mb-btn.active { background: var(--g-text); color: #fff; }
      :host([data-mb-dark]) .mb-btn.active { color: #000; }
      .mb-btn:disabled { opacity: 0.6; cursor: wait; }
      button:focus-visible, input:focus-visible { outline: 2px solid var(--g-accent); outline-offset: 2px; }
      .mb-search-row { display: flex; gap: 8px; }
      .mb-input {
        flex: 1;
        min-width: 0;
        min-height: 44px;
        padding: 0 14px;
        border: 0;
        border-radius: 999px;
        background: var(--g-fill);
        color: var(--g-text);
        font: inherit;
        font-size: 15px;
      }
      .mb-output {
        padding: 12px 14px;
        border-radius: 16px;
        background: var(--g-fill);
        font-size: 14px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: min(34vh, calc(var(--mb-viewport-height, 100vh) * 0.38));
        overflow-y: auto;
      }
      .mb-toast {
        position: fixed;
        top: calc(12px + max(env(safe-area-inset-top, 0px), var(--mb-viewport-top, 0px)));
        left: var(--mb-viewport-center, 50%);
        transform: translateX(-50%) translateY(-8px);
        padding: 9px 16px;
        border-radius: 999px;
        background: var(--g-bg);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        max-width: calc(var(--mb-viewport-width, 100vw) - 24px);
        color: var(--g-text);
        font-size: 14px;
        font-weight: 500;
        opacity: 0;
        transition: opacity 140ms ease-out, transform 140ms ease-out;
        pointer-events: none;
      }
      .mb-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
      @media (prefers-reduced-motion: reduce) {
        .mb-capsule, .mb-sel-bar.visible, .mb-drawer, .mb-toast { animation: none; transition: none; }
      }
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="mb-toast" id="mb-toast" role="status"></div>
      <button type="button" class="mb-capsule glass" id="mb-capsule" aria-label="打开谜盒" aria-expanded="false">
        <span class="mb-capsule-dot"></span>
        <span id="mb-capsule-text">谜盒 · 1分</span>
      </button>
      <div class="mb-sel-bar glass" id="mb-sel-bar" role="toolbar" aria-label="划词操作">
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
            </div>
            <button type="button" class="mb-close-btn" id="mb-close-drawer" aria-label="关闭">✕</button>
          </div>
          <div class="mb-grid">
            <button type="button" class="mb-btn mb-feature-btn" id="mb-act-reveal">
              <span>网页显影</span><small>数字、日期、限定</small>
            </button>
            <button type="button" class="mb-btn mb-feature-btn" id="mb-act-studio">
              <span>网页拼版</span><small>扫描复原首屏</small>
            </button>
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
            <input type="search" class="mb-input" id="mb-qa-input" aria-label="搜索收藏和笔记" placeholder="搜索收藏和笔记，? 开头可提问" />
            <button type="button" class="mb-btn accent" id="mb-qa-btn">搜索</button>
          </div>
          <div class="mb-output" id="mb-drawer-output" role="status">长按网页文字可摘录、解释或翻译。</div>
        </section>
      </div>
    `;

    shadowRoot.append(style, wrapper);
    document.documentElement.appendChild(hostEl);
    bindShadowEvents();
    updateCapsuleLabel();
    queueViewportUpdate();
    return shadowRoot;
  }

  function showToast(msg) {
    ensureShadowUi();
    const t = shadowRoot.getElementById('mb-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function updateCapsuleLabel() {
    if (!shadowRoot) return;
    const capsule = shadowRoot.getElementById('mb-capsule');
    const textEl = shadowRoot.getElementById('mb-capsule-text');
    capsule.classList.toggle('hidden', currentSettings.touchCapsuleEnabled === false ||
      currentReading.showReadingBadge === false);
    const modeLabels = { warm: ' · 暖纸', dark: ' · 夜读', eink: ' · 墨水' };
    textEl.textContent = `谜盒 · ${estimateReadingMinutes()} 分钟${modeLabels[currentReading.mode] || ''}`;
    hostEl.toggleAttribute('data-mb-dark', currentReading.mode === 'dark');
    const modeBtns = shadowRoot.querySelectorAll('#mb-mode-row [data-mode]');
    modeBtns.forEach((btn) => {
      const active = btn.dataset.mode === currentReading.mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function formatCleanOutput(md) {
    return String(md || '')
      .replace(/^###\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  function queueViewportUpdate() {
    if (viewportFrame || !window.visualViewport) return;
    viewportFrame = requestAnimationFrame(() => {
      viewportFrame = 0;
      if (!hostEl?.isConnected) return;
      const viewport = window.visualViewport;
      const root = document.documentElement;
      const bounds = {
        left: viewport.offsetLeft,
        right: Math.max(0, root.clientWidth - viewport.offsetLeft - viewport.width),
        top: viewport.offsetTop,
        lift: Math.max(0, root.clientHeight - viewport.offsetTop - viewport.height),
        width: viewport.width,
        height: viewport.height,
        center: viewport.offsetLeft + viewport.width / 2
      };
      for (const [key, value] of Object.entries(bounds)) {
        hostEl.style.setProperty(`--mb-viewport-${key}`, `${value}px`);
      }
    });
  }

  function request(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error || !response?.ok) reject(new Error(error?.message || response?.error));
        else resolve(response);
      });
    });
  }

  async function copySelection(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Some browser hosts only support the synchronous clipboard command.
    }
    const field = document.createElement('textarea');
    field.value = text;
    field.readOnly = true;
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.append(field);
    try {
      field.select();
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      field.remove();
    }
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
    const modeRow = shadowRoot.getElementById('mb-mode-row');
    pageStudio = globalThis.miboxPageStudio.mount(shadowRoot, capsule, showToast);
    let drawerRequest = 0;
    let savingNote = false;
    let savingMode = false;

    const setOutput = (text) => {
      out.textContent = formatCleanOutput(text);
      out.scrollTop = 0;
    };
    const openDrawer = () => {
      if (backdrop.classList.contains('open')) return;
      capsule.setAttribute('aria-expanded', 'true');
      backdrop.classList.add('open');
      selBar.classList.remove('visible');
      closeBtn.focus({ preventScroll: true });
    };
    const closeDrawer = () => {
      drawerRequest++;
      backdrop.classList.remove('open');
      capsule.setAttribute('aria-expanded', 'false');
      if (out.getAttribute('aria-busy') === 'true') setOutput('长按网页文字可摘录、解释或翻译。');
      out.removeAttribute('aria-busy');
      if (!capsule.classList.contains('hidden')) capsule.focus({ preventScroll: true });
    };
    const runDrawerTask = async (message, pending, render, button) => {
      if (button?.disabled) return;
      const id = ++drawerRequest;
      if (button) button.disabled = true;
      setOutput(pending);
      out.setAttribute('aria-busy', 'true');
      try {
        const response = await request(message);
        if (id === drawerRequest) setOutput(render(response) || '没有可显示的结果。');
      } catch {
        if (id === drawerRequest) setOutput('操作未完成，请重试。');
      } finally {
        if (button) button.disabled = false;
        if (id === drawerRequest) out.removeAttribute('aria-busy');
      }
    };
    const pageContext = (limit) => ({
      title: document.title,
      url: location.href,
      text: (document.body?.innerText || '').slice(0, limit)
    });

    capsule.addEventListener('click', () => {
      updateCapsuleLabel();
      openDrawer();
    });
    closeBtn.addEventListener('click', closeDrawer);
    shadowRoot.getElementById('mb-act-reveal').addEventListener('click', () => {
      closeDrawer();
      pageStudio.showReveal();
    });
    shadowRoot.getElementById('mb-act-studio').addEventListener('click', () => {
      closeDrawer();
      pageStudio.showLayout();
    });
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeDrawer();
    });
    backdrop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDrawer();
    });

    modeRow.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-mode]');
      if (!button || savingMode || button.dataset.mode === currentReading.mode) return;
      const previous = currentReading.mode;
      savingMode = true;
      applyReadingAttributes({ mode: button.dataset.mode });
      try {
        await request({ type: 'SAVE_READING_MODE', mode: button.dataset.mode });
        showToast(`已切换为「${button.textContent}」`);
      } catch {
        if (currentReading.mode === button.dataset.mode) applyReadingAttributes({ mode: previous });
        showToast('阅读模式保存失败，请重试');
      } finally {
        savingMode = false;
      }
    });

    bmBtn.addEventListener('click', () => {
      runDrawerTask({ type: 'COLLECT_BOOKMARK', payload: pageContext(2000) }, '正在收藏…', (res) => {
        showToast(res.isNew ? '已收藏' : '已更新收藏');
        return `已收藏《${res.item.title}》\n分组：${res.item.group}\n标签：${(res.item.tags || []).join(' · ')}\n简介：${res.item.brief}`;
      }, bmBtn);
    });

    sumBtn.addEventListener('click', () => {
      runDrawerTask({ type: 'AI_ANALYZE', taskMode: 'summary', pageContext: pageContext(5000) },
        '正在提取本页要点…', (res) => res.text, sumBtn);
    });

    const runQa = () => {
      const query = qaInput.value.trim();
      if (!query || qaBtn.disabled) return;
      qaInput.blur();
      runDrawerTask({ type: 'KB_SEARCH_QA', query }, '正在搜索…', (res) => res.answer, qaBtn);
    };
    qaBtn.addEventListener('click', runQa);
    qaInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) runQa();
    });

    selBar.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('[data-act]')) return;
      pressedSelection = lastSelectedText;
      event.preventDefault();
    });
    selBar.addEventListener('pointercancel', () => {
      pressedSelection = '';
      queueSelectionUpdate();
    });
    selBar.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-act]');
      const text = pressedSelection || lastSelectedText;
      pressedSelection = '';
      if (!button || !text) return;
      const act = button.dataset.act;
      if (act === 'clip' && savingNote) return;
      lastSelectedText = '';
      selBar.classList.remove('visible');
      window.getSelection()?.removeAllRanges();

      if (act === 'copy') {
        showToast(await copySelection(text) ? '已复制选中内容' : '复制失败，请重试');
        return;
      }

      if (act === 'clip') {
        savingNote = true;
        showToast('正在保存笔记…');
        try {
          await request({
            type: 'SAVE_NOTE',
            payload: {
              title: `摘录：${text.slice(0, 28)}${text.length > 28 ? '…' : ''}`,
              content: [
                ...text.split('\n').map((line) => `> ${line}`),
                '',
                `- 来源：[${document.title || location.hostname}](${location.href})`,
                `- 摘录时间：${new Date().toLocaleString('zh-CN')}`
              ].join('\n'),
              sourceUrl: location.href,
              sourceTitle: document.title
            }
          });
          showToast('已存为笔记');
        } catch {
          showToast('笔记保存失败，请重试');
        } finally {
          savingNote = false;
        }
        return;
      }

      openDrawer();
      const translating = act === 'translate';
      runDrawerTask({
        type: 'AI_ANALYZE',
        taskMode: translating ? 'selection-translate' : 'selection-explain',
        pageContext: { ...pageContext(2500), selection: text }
      }, translating ? '正在处理翻译…' : '正在分析选中内容…', (res) => res.text);
    });
    document.addEventListener('pointerup', () => {
      if (!pressedSelection) return;
      requestAnimationFrame(() => {
        pressedSelection = '';
        queueSelectionUpdate();
      });
    }, { passive: true, capture: true });
  }

  function queueSelectionUpdate() {
    if (selectionFrame) return;
    selectionFrame = requestAnimationFrame(() => {
      selectionFrame = 0;
      if (!shadowRoot || pressedSelection) return;
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
      const drawer = shadowRoot.getElementById('mb-backdrop');
      const allowed = currentSettings.selectionBarEnabled !== false &&
        !drawer.classList.contains('open') &&
        !element?.isContentEditable &&
        !element?.closest('input, textarea, select');
      const text = allowed && !selection?.isCollapsed ? String(selection || '').trim() : '';
      lastSelectedText = text.length <= 1600 ? text : '';
      shadowRoot.getElementById('mb-sel-bar').classList.toggle('visible', Boolean(lastSelectedText));
    });
  }

  // 初始化读取 storage.local 并绑定 storage.onChanged 实时同步
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get([STORAGE_KEYS.READING, STORAGE_KEYS.SETTINGS], (data) => {
      if (data?.[STORAGE_KEYS.SETTINGS]) {
        currentSettings = { ...currentSettings, ...data[STORAGE_KEYS.SETTINGS] };
      }
      ensureShadowUi();
      if (data?.[STORAGE_KEYS.READING]) applyReadingAttributes(data[STORAGE_KEYS.READING]);
      queueSelectionUpdate();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STORAGE_KEYS.READING]?.newValue) {
        applyReadingAttributes(changes[STORAGE_KEYS.READING].newValue);
      }
      if (changes[STORAGE_KEYS.SETTINGS]?.newValue) {
        currentSettings = { ...currentSettings, ...changes[STORAGE_KEYS.SETTINGS].newValue };
        updateCapsuleLabel();
        pressedSelection = '';
        queueSelectionUpdate();
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

  document.addEventListener('selectionchange', queueSelectionUpdate);
  document.addEventListener('touchend', queueSelectionUpdate, { passive: true });
  window.addEventListener('resize', queueViewportUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', queueViewportUpdate, { passive: true });
  window.visualViewport?.addEventListener('scroll', queueViewportUpdate, { passive: true });
})();
