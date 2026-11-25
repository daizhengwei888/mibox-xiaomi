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
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "MiSans", "PingFang SC", sans-serif;
        color: #1c1c1e;
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
        font-size: 15px;
        line-height: 1.45;
        letter-spacing: -0.01em;
        --g-bg: rgba(250, 250, 252, 0.8);
        --g-edge: rgba(255, 255, 255, 0.75);
        --g-text: #1c1c1e;
        --g-muted: rgba(60, 60, 67, 0.6);
        --g-fill: rgba(118, 118, 128, 0.14);
        --g-accent: #ff6900;
      }
      * { box-sizing: border-box; }
      .glass {
        background: var(--g-bg);
        -webkit-backdrop-filter: blur(24px) saturate(190%);
        backdrop-filter: blur(24px) saturate(190%);
        box-shadow:
          inset 0 0.5px 0 var(--g-edge),
          inset 0 0 0 0.5px var(--g-edge),
          0 10px 30px rgba(0, 0, 0, 0.14),
          0 1px 3px rgba(0, 0, 0, 0.08);
      }
      .mb-capsule {
        pointer-events: auto;
        position: fixed;
        right: 12px;
        bottom: 88px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 40px;
        padding: 0 14px;
        border: 0;
        border-radius: 999px;
        color: var(--g-text);
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.4);
      }
      .mb-capsule:active { transform: scale(0.94); }
      .mb-capsule.hidden { display: none; }
      .mb-capsule-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--g-accent); }
      .mb-sel-bar {
        pointer-events: auto;
        position: fixed;
        left: 50%;
        bottom: calc(20px + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 2px;
        padding: 5px;
        border-radius: 999px;
        max-width: min(94vw, 420px);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .mb-sel-bar.visible { display: flex; animation: mb-pop 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.3); }
      @keyframes mb-pop {
        from { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.92); }
        to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
      }
      .mb-sel-btn {
        appearance: none;
        border: 0;
        background: transparent;
        color: var(--g-text);
        min-height: 42px;
        padding: 0 16px;
        border-radius: 999px;
        font: inherit;
        font-size: 15px;
        font-weight: 500;
        white-space: nowrap;
        flex-shrink: 0;
        cursor: pointer;
      }
      .mb-sel-btn.primary { background: var(--g-accent); color: #fff; }
      .mb-sel-btn:active { background: var(--g-fill); }
      .mb-sel-btn.primary:active { filter: brightness(0.92); }
      .mb-drawer-backdrop {
        pointer-events: auto;
        position: fixed;
        inset: 0;
        display: none;
        align-items: flex-end;
        justify-content: center;
        background: rgba(0, 0, 0, 0.18);
      }
      .mb-drawer-backdrop.open { display: flex; }
      .mb-drawer {
        width: min(100%, 520px);
        max-height: 82vh;
        overflow-y: auto;
        margin: 0 8px calc(8px + env(safe-area-inset-bottom, 0px));
        padding: 18px 16px 16px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.72);
        -webkit-backdrop-filter: blur(30px) saturate(190%);
        backdrop-filter: blur(30px) saturate(190%);
        box-shadow: inset 0 0.5px 0 var(--g-edge), 0 20px 50px rgba(0, 0, 0, 0.2);
        color: var(--g-text);
        display: flex;
        flex-direction: column;
        gap: 14px;
        animation: mb-up 0.36s cubic-bezier(0.2, 0.9, 0.3, 1.1);
      }
      @keyframes mb-up { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
      .mb-drawer[data-dark="true"] {
        --g-text: #f5f5f7;
        --g-muted: rgba(235, 235, 245, 0.6);
        --g-fill: rgba(118, 118, 128, 0.3);
        background: rgba(30, 30, 32, 0.72);
      }
      .mb-drawer-head { display: flex; align-items: center; justify-content: space-between; }
      .mb-drawer-title { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 600; }
      .mb-tag { font-size: 12px; font-weight: 400; color: var(--g-muted); }
      .mb-close-btn {
        width: 30px; height: 30px; border: 0; border-radius: 50%;
        background: var(--g-fill); color: var(--g-muted); font-size: 13px; cursor: pointer;
      }
      .mb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .mb-mode-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
      .mb-btn {
        appearance: none;
        border: 0;
        min-height: 42px;
        padding: 0 12px;
        border-radius: 999px;
        background: var(--g-fill);
        color: var(--g-text);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .mb-btn.accent { background: var(--g-accent); color: #fff; }
      .mb-btn.active { background: var(--g-text); color: #fff; }
      .mb-drawer[data-dark="true"] .mb-btn.active { color: #000; }
      .mb-search-row { display: flex; gap: 8px; }
      .mb-input {
        flex: 1;
        min-width: 0;
        min-height: 42px;
        padding: 0 14px;
        border: 0;
        border-radius: 999px;
        background: var(--g-fill);
        color: var(--g-text);
        font: inherit;
        font-size: 15px;
        outline: none;
      }
      .mb-output {
        padding: 12px 14px;
        border-radius: 16px;
        background: var(--g-fill);
        font-size: 14px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 34vh;
        overflow-y: auto;
      }
      .mb-toast {
        position: fixed;
        top: calc(12px + env(safe-area-inset-top, 0px));
        left: 50%;
        transform: translateX(-50%) translateY(-8px);
        padding: 9px 16px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.6);
        -webkit-backdrop-filter: blur(18px) saturate(190%);
        backdrop-filter: blur(18px) saturate(190%);
        box-shadow: inset 0 0.5px 0 var(--g-edge), 0 8px 24px rgba(0, 0, 0, 0.14);
        color: var(--g-text);
        font-size: 14px;
        font-weight: 500;
        opacity: 0;
        transition: opacity 0.2s, transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.3);
        pointer-events: none;
      }
      .mb-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="mb-toast" id="mb-toast"></div>
      <button type="button" class="mb-capsule glass" id="mb-capsule" aria-label="打开谜盒">
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
