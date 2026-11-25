(() => {
  const FILTERS = {
    number: /(?:[¥￥$€£]\s*)?[+−-]?\d+(?:[.,，]\d+)*(?:\s?(?:[%％]|元|万|亿|小时|分钟|秒|天|人|件|岁|倍|GB|MB|km|mm))?/gi,
    date: /\b\d{4}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b|(?:\d{4}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*[日号]|\b(?:[01]?\d|2[0-3])[:：][0-5]\d\b|(?:星期|周)[一二三四五六日天]|截止(?:至|到)?|有效期/g,
    limit: /最终解释权|最低消费|以[^。，；！？\n]{1,18}为准|不参与|不适用|不可叠加|不可退|不支持|不包含|不超过|仅适用于|仅适用|仅支持|规定时间|须在|需在|仅限|限于|限量|限时|限购|除外|除非|不含|最多|至少|起订|每人|指定|必须|前提|但需|否则|(?:满|每满)\s*\d+(?:\.\d+)?\s*(?:元)?/g
  };
  const BLOCKS = 'h1, h2, h3, h4, p, li, blockquote, figcaption, dt, dd, td, th';
  const SKIP = 'script, style, noscript, input, textarea, select, button, nav, footer, [hidden], [aria-hidden="true"], [contenteditable]:not([contenteditable="false"])';
  const HIGHLIGHT = 'mibox-evidence';
  const MEDIA = '(prefers-reduced-motion: reduce)';

  const styles = `
    .mb-reveal[hidden] { display: none; }
    .mb-reveal {
      position: fixed;
      left: var(--mb-viewport-center, 50%);
      bottom: calc(12px + max(env(safe-area-inset-bottom, 0px), var(--mb-viewport-lift, 0px)));
      transform: translateX(-50%);
      pointer-events: auto;
      display: grid;
      gap: 6px;
      width: min(420px, calc(var(--mb-viewport-width, 100vw) - 16px));
      border-radius: 19px;
      background: var(--g-bg);
      color: var(--g-text);
      padding: 8px;
      box-shadow: 0 4px 20px #0003;
    }
    .mb-reveal-filters, .mb-studio-controls {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 5px;
    }
    .mb-reveal-tail {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      gap: 4px;
      padding-left: 6px;
    }
    .mb-reveal-tail .mb-btn { padding: 0 9px; }
    .mb-studio-status { color: var(--g-muted); font-size: 13px; }
    .mb-studio {
      position: fixed;
      inset: auto 0 max(8px, env(safe-area-inset-bottom, 0px));
      width: min(calc(100% - 16px), 520px);
      max-height: min(87vh, calc(var(--mb-viewport-height, 100vh) - 20px));
      justify-self: center;
      margin: 0 auto;
      padding: 12px;
      overflow: auto;
      overscroll-behavior: contain;
      pointer-events: auto;
      border: 1px solid var(--g-fill);
      border-radius: 22px;
      background: var(--g-bg);
      color: var(--g-text);
      box-shadow: 0 12px 40px #0003;
    }
    .mb-studio[open] { display: grid; gap: 9px; }
    .mb-studio::backdrop { background: #15110c75; }
    .mb-studio-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    .mb-studio-title { font-weight: 700; font-size: 16px; }
    .mb-studio-track { height: 3px; overflow: hidden; background: var(--g-fill); border-radius: 3px; }
    .mb-studio-track span {
      display: block;
      height: 100%;
      background: var(--g-accent);
      transform: scaleX(var(--mb-progress, 0));
      transform-origin: left;
      transition: transform 150ms ease-out;
    }
    .mb-studio-sheet {
      min-height: min(280px, 42vh);
      max-height: min(48vh, calc(var(--mb-viewport-height, 100vh) * .56));
      overflow: auto;
      overscroll-behavior: contain;
      padding: 17px 14px;
      border-top: 2px solid var(--g-accent);
      background: #fff6e9;
      color: #332217;
      border-radius: 4px 4px 12px 12px;
    }
    :host([data-mb-dark]) .mb-studio-sheet { background: #322a24; color: #f3e5d9; }
    .mb-studio-piece { margin: 0; font-size: 14px; line-height: 1.56; overflow-wrap: anywhere; }
    .mb-studio-piece[hidden] { display: none; }
    .mb-studio-piece + .mb-studio-piece { margin-top: 8px; }
    .mb-studio-piece[data-kind="heading"] {
      font-family: Georgia, "Noto Serif CJK SC", serif;
      font-size: 20px;
      font-weight: 750;
      line-height: 1.28;
    }
    .mb-studio-piece img { display: block; width: 100%; height: min(16vh, 116px); object-fit: contain; }
    .mb-studio-piece figcaption { margin-top: 4px; font-size: 12px; }
    .mb-studio-piece[data-current]:not([data-static]) { animation: mb-typeset-in 190ms ease-out both; }
    @keyframes mb-typeset-in { from { opacity: 0; transform: translateY(7px); } }
    .mb-studio-foot { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
    .mb-studio-foot .mb-btn { padding: 0 10px; }
    .mb-studio :disabled, .mb-reveal :disabled { cursor: default; opacity: .46; }
    .mb-capsule { user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
    @media (prefers-reduced-motion: reduce) {
      .mb-studio-piece[data-current], .mb-studio-track span { animation: none; transition: none; }
    }
  `;

  function scopeForPage() {
    return document.querySelector('article') || document.querySelector('main, [role="main"]') || document.body;
  }

  function readableBlocks(scope, max, includeImages = false) {
    if (!scope) return [];
    const tags = includeImages ? 'h1, h2, h3, h4, p, li, blockquote, img' : BLOCKS;
    const elements = scope.querySelectorAll(tags);
    const results = [];
    for (let index = 0; index < Math.min(elements.length, 900) && results.length < max; index++) {
      const element = elements[index];
      if (element.closest(SKIP) || !element.getClientRects().length) continue;
      const parentBlock = element.parentElement?.closest(tags);
      if (element.tagName !== 'IMG' && parentBlock && parentBlock !== scope) continue;
      results.push(element);
    }
    if (results.length) return results;
    return Array.from(scope.children)
      .filter((element) => !element.matches(SKIP) && element.getClientRects().length)
      .slice(0, max);
  }

  function collectEvidence(block, filter, cap) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest(SKIP)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    let text = '';
    const positions = [];
    for (let node = walker.nextNode(); node && text.length < 2200 && positions.length < 120; node = walker.nextNode()) {
      if (!node.data) continue;
      const start = text.length;
      text += node.data.slice(0, 2200 - start);
      positions.push({ node, start, end: text.length });
    }
    const matches = [];
    for (const match of text.matchAll(FILTERS[filter])) {
      const from = match.index;
      const to = from + match[0].length;
      const start = positions.find((item) => from < item.end);
      const end = positions.find((item) => to <= item.end);
      const range = new Range();
      range.setStart(start.node, from - start.start);
      range.setEnd(end.node, to - end.start);
      matches.push({ range, block });
      if (matches.length >= cap) break;
    }
    return matches;
  }

  function setupReveal(root) {
    const toolbar = root.getElementById('mb-reveal');
    const filters = [...toolbar.querySelectorAll('[data-filter]')];
    const counter = root.getElementById('mb-reveal-count');
    const next = root.getElementById('mb-reveal-next');
    const cssHighlights = typeof Highlight === 'function' ? globalThis.CSS?.highlights : null;
    let enabled = false;
    let category = 'limit';
    let updated = [];
    let evidence = [];
    let position = -1;

    function clear() {
      cssHighlights?.delete(HIGHLIGHT);
      for (const block of updated) {
        block.removeAttribute('data-mibox-reveal-muted');
        block.removeAttribute('data-mibox-reveal-match');
      }
      updated = [];
      evidence = [];
      position = -1;
    }

    function close() {
      clear();
      toolbar.hidden = true;
      enabled = false;
    }

    function show(persistent) {
      clear();
      enabled = true;
      const blocks = readableBlocks(scopeForPage(), 320);
      const unmatched = [];
      for (const block of blocks) {
        const hits = collectEvidence(block, category, 240 - evidence.length);
        if (hits.length) {
          evidence.push(...hits);
          if (!cssHighlights) {
            block.setAttribute('data-mibox-reveal-match', '');
            updated.push(block);
          }
        } else {
          unmatched.push(block);
        }
        if (evidence.length >= 240) break;
      }
      if (evidence.length) {
        for (const block of unmatched) {
          block.setAttribute('data-mibox-reveal-muted', '');
          updated.push(block);
        }
      }
      if (cssHighlights && evidence.length) {
        cssHighlights.set(HIGHLIGHT, new Highlight(...evidence.map(({ range }) => range)));
      }
      toolbar.hidden = !persistent;
      next.disabled = !evidence.length;
      counter.textContent = evidence.length === 240 ? '前 240 处' : evidence.length ? `${evidence.length} 处` : '未找到匹配';
      filters.forEach((button) => {
        const selected = button.dataset.filter === category;
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('active', selected);
      });
    }

    for (const button of filters) {
      button.addEventListener('click', () => {
        category = button.dataset.filter;
        show(true);
      });
    }
    root.getElementById('mb-reveal-close').addEventListener('click', close);
    next.addEventListener('click', () => {
      evidence = evidence.filter(({ range, block }) => range.startContainer.isConnected && block.isConnected);
      if (!evidence.length) {
        show(true);
        return;
      }
      position = (position + 1) % evidence.length;
      const hit = evidence[position];
      const top = hit.range.getBoundingClientRect().top;
      const height = window.visualViewport?.height || window.innerHeight;
      window.scrollBy({ top: top - height * 0.38, behavior: matchMedia(MEDIA).matches ? 'instant' : 'smooth' });
      counter.textContent = `${position + 1} / ${evidence.length} 处`;
    });

    return { show, close, isEnabled: () => enabled };
  }

  function summarizeBlock(element) {
    if (element.tagName === 'IMG') {
      const source = element.currentSrc;
      if (!element.complete || element.naturalWidth < 100 || !/^https?:\/\//i.test(source)) return null;
      return { kind: 'photo', source, text: element.alt.trim().slice(0, 75), element };
    }
    const text = element.innerText?.replace(/\s+/g, ' ').trim() || '';
    if (!text) return null;
    const kind = /^H[1-4]$/.test(element.tagName) ? 'heading' : 'text';
    const max = kind === 'heading' ? 80 : 155;
    return { kind, text: text.length > max ? `${text.slice(0, max).trimEnd()}…` : text, element };
  }

  function pagePieces() {
    const scope = scopeForPage();
    const candidates = readableBlocks(scope, 48, true).map(summarizeBlock).filter(Boolean);
    const title = candidates.find((item) => item.kind === 'heading') || {
      kind: 'heading', text: document.title.trim().slice(0, 80), element: scope
    };
    const photo = candidates.find((item) => item.kind === 'photo');
    const body = candidates.filter((item) => item.kind === 'text').slice(0, photo ? 3 : 4);
    if (!photo && !body.length && !candidates.length) return [];
    if (photo) body.push(photo);
    return [title, ...body].filter((piece) => piece.text || piece.source);
  }

  function createPiece(piece) {
    const element = document.createElement(piece.kind === 'photo' ? 'figure'
      : piece.kind === 'heading' ? 'h3' : 'p');
    element.className = 'mb-studio-piece';
    element.dataset.kind = piece.kind;
    if (piece.kind === 'photo') {
      const image = new Image();
      image.src = piece.source;
      image.alt = piece.text;
      image.decoding = 'async';
      element.append(image);
      if (piece.text) {
        const caption = document.createElement('figcaption');
        caption.textContent = piece.text;
        element.append(caption);
      }
    } else {
      element.textContent = piece.text;
    }
    return element;
  }

  function setupLayout(root, notify) {
    const dialog = root.getElementById('mb-studio');
    const sheet = root.getElementById('mb-studio-sheet');
    const bar = root.getElementById('mb-studio-track');
    const counter = root.getElementById('mb-studio-count');
    const play = root.getElementById('mb-studio-play');
    const previous = root.getElementById('mb-studio-previous');
    const next = root.getElementById('mb-studio-next');
    const back = root.getElementById('mb-studio-original');
    const motion = matchMedia(MEDIA);
    let parts = [];
    let cards = [];
    let index = 0;
    let timer = 0;

    function render() {
      cards.forEach((card, i) => {
        card.hidden = i > index;
        card.toggleAttribute('data-current', i === index);
        card.toggleAttribute('data-static', motion.matches);
      });
      const shown = index + 1;
      const labels = { heading: '标题', text: '正文', photo: '图片' };
      counter.textContent = `${labels[parts[index].kind]} · ${shown} / ${parts.length}`;
      bar.style.setProperty('--mb-progress', shown / parts.length);
      previous.disabled = index === 0;
      next.disabled = shown === parts.length;
      play.textContent = timer ? '暂停' : next.disabled ? '重播' : '播放';
      if (index === 0) sheet.scrollTop = 0;
      else if (index > 1) sheet.scrollTop = sheet.scrollHeight;
    }

    function pause() {
      clearInterval(timer);
      timer = 0;
    }

    function start() {
      pause();
      if (index === parts.length - 1) index = 0;
      if (parts.length > 1) {
        timer = setInterval(() => {
          index += 1;
          if (index === parts.length - 1) pause();
          render();
        }, 490);
      }
      render();
    }

    function close() {
      pause();
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      sheet.replaceChildren();
      parts = [];
      cards = [];
    }

    function show() {
      if (dialog.open) return;
      parts = pagePieces();
      if (!parts.length) {
        notify('当前网页没有可拼版的正文');
        return;
      }
      cards = parts.map(createPiece);
      sheet.replaceChildren(...cards);
      index = 0;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      if (motion.matches) render();
      else start();
    }

    root.getElementById('mb-studio-close').addEventListener('click', close);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    previous.addEventListener('click', () => {
      pause();
      index -= 1;
      render();
    });
    next.addEventListener('click', () => {
      pause();
      index += 1;
      render();
    });
    play.addEventListener('click', () => {
      if (timer) {
        pause();
        render();
      } else start();
    });
    back.addEventListener('click', () => {
      const source = parts[index]?.element;
      close();
      if (source?.isConnected) source.scrollIntoView({
        behavior: motion.matches ? 'instant' : 'smooth', block: 'center'
      });
      else notify('原文位置已变化');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && timer) {
        pause();
        render();
      }
    });

    return { show, close };
  }

  function mount(root, capsule, notify) {
    const style = document.createElement('style');
    style.textContent = styles;
    const template = document.createElement('template');
    template.innerHTML = `
      <div class="mb-reveal" id="mb-reveal" role="group" aria-label="网页显影" hidden>
        <div class="mb-reveal-filters">
          <button type="button" class="mb-btn" data-filter="number">数字</button>
          <button type="button" class="mb-btn" data-filter="date">日期</button>
          <button type="button" class="mb-btn" data-filter="limit">限定</button>
        </div>
        <div class="mb-reveal-tail">
          <span class="mb-studio-status" id="mb-reveal-count" role="status"></span>
          <button type="button" class="mb-btn" id="mb-reveal-next">下一处</button>
          <button type="button" class="mb-close-btn" id="mb-reveal-close" aria-label="退出显影">✕</button>
        </div>
      </div>
      <dialog class="mb-studio" id="mb-studio" aria-labelledby="mb-studio-title">
        <div class="mb-studio-head">
          <span class="mb-studio-title" id="mb-studio-title">网页拼版</span>
          <button type="button" class="mb-close-btn" id="mb-studio-close" aria-label="关闭拼版" autofocus>✕</button>
        </div>
        <div class="mb-studio-track" id="mb-studio-track" aria-hidden="true"><span></span></div>
        <div class="mb-studio-sheet" id="mb-studio-sheet" aria-label="拼版预览"></div>
        <div class="mb-studio-controls">
          <button type="button" class="mb-btn" id="mb-studio-previous">上一段</button>
          <button type="button" class="mb-btn accent" id="mb-studio-play">播放</button>
          <button type="button" class="mb-btn" id="mb-studio-next">下一段</button>
        </div>
        <div class="mb-studio-foot">
          <span class="mb-studio-status" id="mb-studio-count"></span>
          <button type="button" class="mb-btn" id="mb-studio-original">定位原文</button>
        </div>
      </dialog>
    `;
    root.append(style, template.content);
    const reveal = setupReveal(root);
    const layout = setupLayout(root, notify);
    const rebuild = globalThis.miboxPageRebuild.mount(root);
    let holdTimer = 0;
    let origin = null;
    let temporary = false;
    let skipClickUntil = 0;

    function endHold() {
      clearTimeout(holdTimer);
      origin = null;
      if (temporary) {
        temporary = false;
        skipClickUntil = performance.now() + 450;
        reveal.close();
      }
    }

    capsule.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || reveal.isEnabled()) return;
      origin = { x: event.clientX, y: event.clientY };
      holdTimer = setTimeout(() => {
        temporary = true;
        reveal.show(false);
      }, 360);
      capsule.setPointerCapture?.(event.pointerId);
    });
    capsule.addEventListener('pointermove', (event) => {
      if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 14) endHold();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      capsule.addEventListener(name, endHold);
    }
    capsule.addEventListener('contextmenu', (event) => event.preventDefault());
    capsule.addEventListener('click', (event) => {
      if (event.detail !== 0 && performance.now() < skipClickUntil) event.stopImmediatePropagation();
    }, true);

    window.addEventListener('pagehide', () => {
      endHold();
      reveal.close();
      layout.close();
      rebuild.close();
    });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && reveal.isEnabled()) reveal.close();
    });
    return {
      showReveal() {
        reveal.show(true);
      },
      showLayout() {
        reveal.close();
        if (!rebuild.show()) layout.show();
      }
    };
  }

  globalThis.miboxPageStudio = { mount };
})();
