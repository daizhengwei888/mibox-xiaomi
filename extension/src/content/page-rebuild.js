(() => {
  const WORDS = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,td,th,a,[role="heading"]';
  const MEDIA = 'img,picture,svg,video,canvas,iframe';
  const PANELS = 'header,nav,main,section,article,aside,footer,figure,hr,button,input,select,textarea,[role="button"]';
  const EXCLUDED = 'script,style,noscript,template,[hidden],[aria-hidden="true"]';
  const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
  const DURATION = 4080;
  const COLORS = {
    field: '#141517',
    grid: '#292725',
    idle: '#624936',
    trace: '#f9a96b',
    edge: '#ffddb8'
  };

  const styles = `
    .mb-rebuild {
      margin: 0;
      padding: 0;
      border: 0;
      max-width: none;
      max-height: none;
      position: fixed;
      inset: auto;
      overflow: hidden;
      background: transparent;
      color: #fff4e7;
      pointer-events: auto;
      overscroll-behavior: none;
    }
    .mb-rebuild::backdrop { background: transparent; }
    .mb-rebuild-canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
    }
    .mb-rebuild-control {
      position: absolute;
      left: 50%;
      bottom: max(10px, env(safe-area-inset-bottom, 0px));
      transform: translateX(-50%);
      width: min(400px, calc(100% - 20px));
      display: grid;
      gap: 7px;
      padding: 9px 10px 8px;
      border: 1px solid #5f493a;
      border-radius: 16px;
      background: #211e1d;
      box-shadow: 0 4px 22px #0004;
    }
    .mb-rebuild-row { display: flex; min-width: 0; align-items: center; gap: 7px; }
    .mb-rebuild-caption { flex: 1; min-width: 0; padding-left: 3px; }
    .mb-rebuild-caption strong {
      display: block;
      font: 650 14px/1.25 system-ui, sans-serif;
    }
    .mb-rebuild-caption span {
      display: block;
      color: #e4bb98;
      font: 400 12px/1.35 system-ui, sans-serif;
      margin-top: 2px;
    }
    .mb-rebuild-progress {
      appearance: none;
      display: block;
      border: 0;
      width: 100%;
      height: 3px;
      overflow: hidden;
      border-radius: 3px;
      background: #4a3b30;
    }
    .mb-rebuild-progress::-webkit-progress-bar { background: #4a3b30; }
    .mb-rebuild-progress::-webkit-progress-value { background: #ffa667; }
    .mb-rebuild-action {
      appearance: none;
      border: 0;
      border-radius: 9px;
      min-height: 44px;
      min-width: 52px;
      padding: 0 11px;
      white-space: nowrap;
      color: #fff4e7;
      background: #40352f;
      font: 550 13px/1 system-ui, sans-serif;
      touch-action: manipulation;
    }
    .mb-rebuild-action[data-main] { color: #28160c; background: #ffac73; }
    .mb-rebuild-action:active { filter: brightness(.9); }
    .mb-rebuild-action:focus-visible { outline: 2px solid #ffc997; outline-offset: 2px; }
    @media (max-width: 345px) {
      .mb-rebuild-row { gap: 5px; }
      .mb-rebuild-action { min-width: 44px; padding: 0 8px; }
    }
  `;

  function measureViewport() {
    const vp = window.visualViewport;
    return {
      left: vp?.offsetLeft || 0,
      top: vp?.offsetTop || 0,
      width: vp?.width || document.documentElement.clientWidth,
      height: vp?.height || window.innerHeight
    };
  }

  function clippedRect(rect, vp, padding = 0) {
    const x = Math.max(0, rect.left - vp.left - padding);
    const y = Math.max(0, rect.top - vp.top - padding);
    const right = Math.min(vp.width, rect.right - vp.left + padding);
    const bottom = Math.min(vp.height, rect.bottom - vp.top + padding);
    return right - x >= 2 && bottom - y >= 2 ? { x, y, w: right - x, h: bottom - y } : null;
  }

  function nearbyElements(vp) {
    const selector = `${WORDS},${MEDIA},${PANELS}`;
    const found = new Set();
    const gradients = new Set();
    for (const y of [.05, .14, .27, .42, .57, .71, .87, .95]) {
      for (const x of [.07, .26, .48, .70, .92]) {
        const hit = document.elementFromPoint(vp.left + vp.width * x, vp.top + vp.height * y);
        if (!hit || hit.closest('#mibox-xiaomi-touch-host')) continue;
        const content = hit.closest(selector);
        const container = hit.closest(PANELS);
        if (content) found.add(content);
        if (container) found.add(container);
        if (!content || hit !== content) {
          const colorLayer = getComputedStyle(hit).backgroundImage;
          if (!hit.textContent.trim() && colorLayer !== 'none') gradients.add(hit);
        }
      }
    }
    const ordinary = document.body.querySelectorAll(selector);
    for (let i = 0; i < Math.min(ordinary.length, 400); i++) found.add(ordinary[i]);
    return { found, gradients };
  }

  function textLines(element, vp) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.data.trim() && !node.parentElement.closest(EXCLUDED)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    const lines = [];
    const probe = document.createRange();
    for (let node = walker.nextNode(), inspected = 0; node && inspected < 36; node = walker.nextNode(), inspected++) {
      probe.selectNodeContents(node);
      for (const rect of probe.getClientRects()) {
        const line = clippedRect(rect, vp, 1.5);
        if (!line) continue;
        const sameRow = lines.find((item) => Math.abs(item.y - line.y) < 4 &&
          Math.abs(item.h - line.h) < 6);
        if (sameRow) {
          const left = Math.min(sameRow.x, line.x);
          const end = Math.max(sameRow.x + sameRow.w, line.x + line.w);
          sameRow.x = left;
          sameRow.w = end - left;
        } else if (lines.length < 12) lines.push(line);
      }
    }
    return lines.sort((a, b) => a.y - b.y || a.x - b.x);
  }

  function scan(vp) {
    if (document.hidden) return null;
    const { found, gradients } = nearbyElements(vp);
    const outlines = [];
    const text = [];
    const pictures = [];
    const covered = new WeakSet();
    const duplicates = new Set();
    for (const element of [...found, ...gradients]) {
      if (element.closest(EXCLUDED)) continue;
      const box = clippedRect(element.getBoundingClientRect(), vp);
      if (!box) continue;
      const css = getComputedStyle(element);
      if (css.visibility !== 'visible' || Number(css.opacity) === 0) continue;
      const key = [box.x, box.y, box.w, box.h].map((n) => Math.round(n / 3)).join('/');
      const media = element.matches(MEDIA) || gradients.has(element);
      if (media) {
        if (box.w >= 26 && box.h >= 21 && !duplicates.has(key) && pictures.length < 12) {
          duplicates.add(key);
          pictures.push(box);
          outlines.push(box);
        }
      } else if (element.matches(WORDS)) {
        if (text.length >= 34 || covered.has(element.parentElement.closest(WORDS))) continue;
        const lines = textLines(element, vp);
        if (lines.length) {
          text.push({ box, lines, rtl: css.direction === 'rtl' });
          covered.add(element);
        }
      } else if (!duplicates.has(key) && box.w >= 24 && box.h >= 2 && outlines.length < 30) {
        duplicates.add(key);
        outlines.push(box);
      }
    }
    const order = (a, b) => a.y - b.y || a.x - b.x;
    const nonempty = outlines.length + text.length + pictures.length;
    if (!nonempty) return null;
    return {
      outlines: outlines.sort(order).slice(0, 22),
      lettering: text.sort((a, b) => order(a.box, b.box)),
      pictures: pictures.sort(order)
    };
  }

  const fraction = (elapsed, start, end) => Math.max(0, Math.min(1, (elapsed - start) / (end - start)));
  const ease = (t) => t * t * (3 - 2 * t);

  function traceBox(ctx, { x, y, w, h }, t) {
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    let remaining = t * (2 * w + 2 * h);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 1; i < corners.length && remaining > 0; i++) {
      const previous = corners[i - 1];
      const next = corners[i];
      const length = i % 2 === 1 ? w : h;
      const part = Math.min(1, remaining / length);
      ctx.lineTo(
        previous[0] + (next[0] - previous[0]) * part,
        previous[1] + (next[1] - previous[1]) * part
      );
      remaining -= length;
    }
    ctx.stroke();
  }

  function frameMask(ctx, vp, scene, elapsed) {
    const { width, height } = vp;
    ctx.clearRect(0, 0, width, height);
    const release = 1 - ease(fraction(elapsed, 3430, DURATION));
    const cover = ease(fraction(elapsed, 0, 210)) * release;
    if (cover <= 0) return;

    ctx.globalAlpha = cover;
    ctx.fillStyle = COLORS.field;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 16.5; x < width; x += 26) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 16.5; y < height; y += 26) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    ctx.strokeStyle = COLORS.idle;
    const outlineCount = Math.max(1, scene.outlines.length);
    scene.outlines.forEach((box, i) => {
      const start = 260 + (i / outlineCount) * 760;
      const t = ease(fraction(elapsed, start, start + 640));
      if (t > 0) traceBox(ctx, box, t);
    });
    const scanY = ease(fraction(elapsed, 155, 1600)) * height;
    if (scanY > 0 && scanY < height) {
      ctx.strokeStyle = COLORS.trace;
      ctx.globalAlpha = cover * .76;
      ctx.beginPath();
      ctx.moveTo(0, scanY);
      ctx.lineTo(width, scanY);
      ctx.stroke();
      ctx.globalAlpha = cover * .12;
      ctx.fillStyle = COLORS.trace;
      ctx.fillRect(0, Math.max(0, scanY - 10), width, 10);
    }

    const glints = [];
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#fff';
    const groups = Math.max(1, scene.lettering.length);
    scene.lettering.forEach(({ lines, rtl }, i) => {
      const start = 720 + (i / groups) * 1510;
      lines.forEach((line, j) => {
        const from = start + j * Math.min(62, 240 / lines.length);
        const t = ease(fraction(elapsed, from, from + 460));
        if (t <= 0) return;
        const shown = line.w * t;
        const x = rtl ? line.x + line.w - shown : line.x;
        ctx.fillRect(x, line.y, shown, line.h);
        if (j === 0 && t < 1) glints.push([rtl ? x : x + shown, line.y, line.h]);
      });
    });
    const images = Math.max(1, scene.pictures.length);
    scene.pictures.forEach((box, i) => {
      const start = 2130 + (i / images) * 575;
      const t = ease(fraction(elapsed, start, start + 680));
      if (t <= 0) return;
      const revealed = box.h * t;
      ctx.fillRect(box.x, box.y, box.w, revealed);
      if (t < 1) glints.push([box.x + box.w, box.y + revealed, 8]);
    });
    ctx.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = release;
    ctx.strokeStyle = COLORS.edge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [x, y, h] of glints) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function mount(root) {
    const motion = matchMedia(REDUCED_MOTION);
    const template = document.createElement('template');
    template.innerHTML = `
      <style>${styles}</style>
      <dialog class="mb-rebuild" id="mb-rebuild" aria-labelledby="mb-rebuild-title">
        <canvas class="mb-rebuild-canvas" aria-hidden="true"></canvas>
        <div class="mb-rebuild-control">
          <div class="mb-rebuild-row">
            <div class="mb-rebuild-caption">
              <strong id="mb-rebuild-title">网页拼版</strong>
              <span id="mb-rebuild-stage" role="status"></span>
            </div>
            <button type="button" class="mb-rebuild-action" id="mb-rebuild-play">暂停</button>
            <button type="button" class="mb-rebuild-action" id="mb-rebuild-exit" data-main autofocus>回到网页</button>
          </div>
          <progress class="mb-rebuild-progress" max="100" value="0" aria-label="复原进度"></progress>
        </div>
      </dialog>
    `;
    root.append(template.content);
    const dialog = root.getElementById('mb-rebuild');
    const canvas = dialog.querySelector('canvas');
    const status = root.getElementById('mb-rebuild-stage');
    const progress = dialog.querySelector('progress');
    const play = root.getElementById('mb-rebuild-play');
    let ctx;
    let vp;
    let scene;
    let elapsed = 0;
    let lastTime = 0;
    let frame = 0;
    let state = 'ready';

    function stopFrame() {
      cancelAnimationFrame(frame);
      frame = 0;
    }

    function close() {
      if (!dialog.open) return;
      stopFrame();
      state = 'ready';
      dialog.close();
      canvas.width = 0;
      scene = null;
    }

    function draw() {
      frameMask(ctx, vp, scene, elapsed);
      const percent = Math.round(elapsed * 100 / DURATION);
      if (percent !== progress.value) progress.value = percent;
      let label = '扫描版面';
      if (elapsed >= DURATION) label = '首屏已复原';
      else if (elapsed >= 2130) label = scene.pictures.length ? '图像显影' : '合成页面';
      else if (elapsed >= 720) label = '文字归位';
      if (status.textContent !== label) status.textContent = label;
    }

    function tick(now) {
      elapsed = Math.min(DURATION, elapsed + Math.max(0, now - lastTime));
      lastTime = now;
      draw();
      if (elapsed >= DURATION) {
        state = 'done';
        play.textContent = '重播';
        frame = 0;
      } else frame = requestAnimationFrame(tick);
    }

    function start() {
      if (state === 'done') elapsed = 0;
      state = 'playing';
      play.textContent = '暂停';
      lastTime = performance.now();
      draw();
      frame = requestAnimationFrame(tick);
    }

    function pause() {
      if (state !== 'playing') return;
      stopFrame();
      state = 'paused';
      play.textContent = '继续';
    }

    function show() {
      if (dialog.open) return true;
      if (motion.matches || typeof dialog.showModal !== 'function' || !document.body) return false;
      vp = measureViewport();
      scene = scan(vp);
      if (!scene) return false;
      ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.65);
      canvas.width = Math.ceil(vp.width * dpr);
      canvas.height = Math.ceil(vp.height * dpr);
      ctx.setTransform(canvas.width / vp.width, 0, 0, canvas.height / vp.height, 0, 0);
      Object.assign(dialog.style, {
        left: `${vp.left}px`, top: `${vp.top}px`, width: `${vp.width}px`, height: `${vp.height}px`
      });
      elapsed = 0;
      dialog.showModal();
      start();
      return true;
    }

    play.addEventListener('click', () => {
      if (state === 'playing') pause();
      else start();
    });
    root.getElementById('mb-rebuild-exit').addEventListener('click', close);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    canvas.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
    window.addEventListener('resize', close);
    window.visualViewport?.addEventListener('resize', close);
    window.visualViewport?.addEventListener('scroll', close);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause();
    });
    motion.addEventListener('change', close);
    return { show, close };
  }

  globalThis.miboxPageRebuild = { mount };
})();
