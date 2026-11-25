// 小米浏览器手机 / Pad 双端视口测量与五套高定主题引导（严格遵循 mibrowser-extension-dev SKILL.md §0）

export const SKINS = [
  { id: 'xiaomi-orange', name: '小米橙·灵动', badge: '参赛主推', accent: '#ff6900', bg: '#fffaf5', dark: false },
  { id: 'obsidian-dark', name: '曜石黑·OLED', badge: '深邃夜读', accent: '#38bdf8', bg: '#0f141c', dark: true },
  { id: 'paper-warm', name: '宣纸暖·护眼', badge: '沉浸长读', accent: '#b45309', bg: '#f6f0e4', dark: false },
  { id: 'ceramic-light', name: '凝脂白·极简', badge: '纯净通透', accent: '#2563eb', bg: '#f8fafc', dark: false },
  { id: 'aurora-jade', name: '极光翠·琉璃', badge: '先锋科技', accent: '#10b981', bg: '#0b1917', dark: true }
];

export const READING_MODES = [
  { id: 'off', name: '原生网页', desc: '保持网站原始样式' },
  { id: 'warm', name: '暖纸护眼', desc: '柔和暖黄纸感，降低蓝光刺激' },
  { id: 'dark', name: '深色夜读', desc: 'OLED 低眩光暗色正文容器' },
  { id: 'eink', name: '墨水屏', desc: '高对比纯黑白阅读器质感' }
];

/**
 * 按照 SKILL.md §0 规范测量当前容器宽度与短边尺寸，绝不用 UA 猜测设备类型
 */
export function measureViewport() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { pageWidth: 360, screenShortSide: 360, layout: 'compact', targetDevice: 'unknown' };
  }
  const pageWidth = document.documentElement.clientWidth || window.innerWidth || 360;
  const screenShortSide = typeof screen !== 'undefined' && screen.width && screen.height
    ? Math.min(screen.width, screen.height)
    : pageWidth;
  const layout = pageWidth >= 600 ? 'wide' : 'compact';
  return {
    pageWidth,
    screenShortSide,
    layout
  };
}

/**
 * 绑定双端自适应布局探针（监听旋转、分屏、窗口尺寸变化）
 */
export function installViewportObserver(onChange) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
  const apply = () => {
    const info = measureViewport();
    document.documentElement.setAttribute('data-mb-layout', info.layout);
    document.documentElement.style.setProperty('--mb-page-width', `${info.pageWidth}px`);
    if (typeof onChange === 'function') onChange(info);
  };
  apply();
  window.addEventListener('resize', apply, { passive: true });
  window.addEventListener('orientationchange', apply, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', apply, { passive: true });
  }
  return () => {
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', apply);
  };
}

export function applySkinToDocument(skinId = 'xiaomi-orange') {
  if (typeof document === 'undefined') return;
  const valid = SKINS.some((s) => s.id === skinId) ? skinId : 'xiaomi-orange';
  document.documentElement.setAttribute('data-mb-skin', valid);
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTimeAgo(ts) {
  if (!ts) return '刚刚';
  const diff = Math.max(0, Date.now() - Number(ts));
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const d = new Date(Number(ts));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, '');
  } catch {
    return '本地页面';
  }
}
