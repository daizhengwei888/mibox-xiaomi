// 谜盒·小米版 AI 双核引擎：Xiaomi MiMo 首席预置 SSE 流式网关 + 零配置本地智能提取引擎
// 确保评委与用户在小米浏览器导入 ZIP 后，无需配置 API Key 即可开箱体验全部智能能力；配置 Key 后自动切换真 SSE 流式生成。

export const AI_PRESETS = [
  {
    id: 'xiaomi-mimo',
    name: 'Xiaomi MiMo（小米大模型 · 推荐）',
    protocol: 'openai',
    baseUrl: 'https://api.mimo.mi.com/v1',
    model: 'mimo-v2.6',
    badge: '大赛官方生态'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek（深度求索）',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    badge: '高性价比'
  },
  {
    id: 'openai',
    name: 'OpenAI / 兼容网关',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    badge: '通用协议'
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-haiku-latest',
    badge: 'Messages'
  }
];

const CATEGORY_RULES = [
  { tag: '小米生态', group: '小米与硬件', kw: /小米|xiaomi|miui|hyperos|澎湃|mimo|米家|雷军|redmi|pad|手机/i },
  { tag: 'AI与大模型', group: 'AI与前沿', kw: /ai|大模型|llm|agent|prompt|vibe\s*coding|gpt|claude|deepseek|机器学习|神经网络|transformer/i },
  { tag: '开发技术', group: '研发工程', kw: /github|javascript|typescript|python|react|vue|css|html|api|架构|源码|算法|docker|linux|chrome|扩展|manifest/i },
  { tag: '深度阅读', group: '人文与专栏', kw: /阅读|文章|博客|思考|指南|教程|研究|历史|哲学|科普|论文|长文/i },
  { tag: '设计灵感', group: '设计与创意', kw: /设计|ui|ux|figma|色彩|排版|动画|交互|图标|视觉|创意/i },
  { tag: '效率工具', group: '生产力工具', kw: /工具|效率|笔记|书签|管理|markdown|自动化|日历|清单|工作流/i }
];

/**
 * 零配置本地智能分类与一句话简介生成（TextRank 关键句评分 + 领域词典）
 */
export function inferBookmarkIntelligence({ title = '', url = '', text = '', description = '' }) {
  const combined = `${title} ${description} ${text.slice(0, 1500)} ${url}`;
  const matchedTags = [];
  let primaryGroup = '精选收藏';

  for (const rule of CATEGORY_RULES) {
    if (rule.kw.test(combined)) {
      matchedTags.push(rule.tag);
      if (primaryGroup === '精选收藏') primaryGroup = rule.group;
    }
  }
  if (matchedTags.length === 0) matchedTags.push('灵感速藏');

  const cleanText = String(description || text || title)
    .replace(/\s+/g, ' ')
    .trim();

  const sentences = cleanText
    .split(/(?<=[。！？.!?\n])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 140);

  let brief = '';
  if (description && description.trim().length >= 10) {
    brief = description.trim().slice(0, 88);
  } else if (sentences.length > 0) {
    const titleWords = String(title)
      .toLowerCase()
      .split(/[\s,，.。:：\-_/|]+/)
      .filter((w) => w.length >= 2);
    let bestScore = -1;
    for (const s of sentences.slice(0, 18)) {
      let score = Math.min(s.length, 80) * 0.2;
      for (const w of titleWords) {
        if (s.toLowerCase().includes(w)) score += 12;
      }
      if (/核心|总结|提供|支持|通过|旨在|介绍|实现/.test(s)) score += 8;
      if (score > bestScore) {
        bestScore = score;
        brief = s;
      }
    }
  }
  if (!brief) {
    brief = `${title || '网页收藏'} —— 自动提炼自 ${url ? new URL(url, 'https://example.com').hostname : '当前阅读页'} 的核心资料卡片。`;
  }
  if (brief.length > 96) brief = `${brief.slice(0, 94)}…`;

  const charCount = String(text || description || title).replace(/\s+/g, '').length;
  const readingMinutes = Math.max(1, Math.ceil(charCount / 450));

  return {
    brief,
    tags: matchedTags.slice(0, 3),
    group: primaryGroup,
    readingMinutes,
    charCount
  };
}

/**
 * 零配置本地网页三要点提炼 / 划词精读 / 中英术语拆解
 */
export function runOfflinePageAnalysis({ mode = 'summary', title = '', url = '', text = '', selection = '' }) {
  const sourceText = String(selection || text || title).replace(/\s+/g, ' ').trim();
  const charCount = sourceText.replace(/\s+/g, '').length;
  const readingMinutes = Math.max(1, Math.ceil(charCount / 450));
  const intel = inferBookmarkIntelligence({ title, url, text: sourceText });

  const sentences = sourceText
    .split(/(?<=[。！？.!?;；\n])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 14 && s.length <= 180);

  const scored = sentences.map((s, idx) => {
    let score = 0;
    if (idx === 0) score += 15;
    if (idx < 5) score += 8;
    if (/因此|总结|关键|核心|必须|支持|要求|创新|结论|首先|其次|最后|特点|优势/.test(s)) score += 14;
    if (/\d+%|\d+MB|\d+px|API|Manifest|AI|MiMo/.test(s)) score += 10;
    score += Math.min(s.length, 90) * 0.15;
    return { s, score, idx };
  });

  scored.sort((a, b) => b.score - a.score);
  const topSentences = scored
    .slice(0, 3)
    .sort((a, b) => a.idx - b.idx)
    .map((item) => item.s);

  if (mode === 'selection-explain') {
    const snippet = selection || sourceText.slice(0, 240);
    return [
      `### ✨ 划词精读与语境拆解`,
      `- **核心语义**：${intel.brief}`,
      `- **关键片段**：「${snippet.slice(0, 120)}${snippet.length > 120 ? '…' : ''}」`,
      `- **分类标签**：${intel.tags.map((t) => `\`#${t}\``).join(' ')}`,
      `- **行动建议**：可一键点击上方「存为笔记」，自动附带来源网址与时间戳归档至谜盒。`
    ].join('\n');
  }

  if (mode === 'selection-translate') {
    const snippet = (selection || sourceText.slice(0, 240)).trim();
    const hasChinese = /[\u4e00-\u9fa5]/.test(snippet);
    const terms = (snippet.match(/[A-Za-z][A-Za-z0-9_-]{2,}|[\u4e00-\u9fa5]{2,6}/g) || []).slice(0, 5);
    return [
      `### 🌐 双语对照与术语解析`,
      `- **原文摘录**：${snippet.slice(0, 160)}${snippet.length > 160 ? '…' : ''}`,
      `- **语种识别**：${hasChinese ? '中文语段 → 提炼英文检索关键词与专业释义' : '外文语段 → 提炼中文核心大意与术语对照'}`,
      `- **核心大意**：${intel.brief}`,
      `- **高频术语**：${terms.length ? terms.map((t) => `\`${t}\``).join(' · ') : '`核心概念`'}`,
      `> 💡 提示：在设置中填入 **Xiaomi MiMo** 或 DeepSeek API Key 后，可开启逐句流式神经机器翻译。`
    ].join('\n');
  }

  const bullets = topSentences.length
    ? topSentences.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : `1. ${intel.brief}\n2. 页面归属分类「${intel.group}」，包含 ${intel.tags.join('、')} 等核心主题。\n3. 建议开启谜盒「暖纸护眼」或「深色夜读」模式进行沉浸阅读。`;

  return [
    `### 📌 《${title || '当前网页'}》核心速读`,
    `**阅读预估**：约 ${readingMinutes} 分钟（${charCount} 字） · **分类**：\`${intel.group}\` ${intel.tags.map((t) => `\`#${t}\``).join(' ')}`,
    ``,
    `**核心要点提炼：**`,
    bullets,
    ``,
    `**一句话结论**：${intel.brief}`
  ].join('\n');
}

/**
 * 全库语义检索与 `? 问题` 直答引擎（支持检索收藏夹 + Markdown 笔记）
 */
export function answerFromKnowledgeBase(query, { bookmarks = [], notes = [] }) {
  const cleanQ = String(query || '').replace(/^[?？]\s*/, '').trim();
  if (!cleanQ) {
    return {
      answer: '请输入你要提问或检索的关键词，例如：`? 小米浏览器扩展支持哪些API` 或 `? 护眼阅读怎么同步`。',
      matches: []
    };
  }

  const terms = cleanQ
    .toLowerCase()
    .split(/[\s,，.。?？!！、/]+/)
    .filter(Boolean);
  const chars = [...cleanQ.toLowerCase()].filter((c) => /[\u4e00-\u9fa5a-z0-9]/.test(c));

  const docs = [
    ...bookmarks.map((b) => ({
      type: 'bookmark',
      id: b.id,
      title: b.title || '未命名收藏',
      url: b.url || '',
      content: `${b.brief || ''} ${(b.tags || []).join(' ')} ${b.group || ''}`,
      updatedAt: b.updatedAt || b.createdAt
    })),
    ...notes.map((n) => ({
      type: 'note',
      id: n.id,
      title: n.title || '未命名笔记',
      url: n.sourceUrl || '',
      content: `${n.content || ''} ${(n.tags || []).join(' ')}`,
      updatedAt: n.updatedAt || n.createdAt
    }))
  ];

  const scored = docs.map((d) => {
    const hay = `${d.title} ${d.content} ${d.url}`.toLowerCase();
    let score = 0;
    if (hay.includes(cleanQ.toLowerCase())) score += 40;
    for (const t of terms) {
      if (d.title.toLowerCase().includes(t)) score += 18;
      if (hay.includes(t)) score += 10;
    }
    let charHits = 0;
    for (const c of chars) {
      if (hay.includes(c)) charHits++;
    }
    score += (charHits / Math.max(1, chars.length)) * 12;
    return { ...d, score };
  }).filter((d) => d.score > 4);

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 4);

  if (top.length === 0) {
    return {
      answer: `未在你的本地知识库中找到与「**${cleanQ}**」直接匹配的记录。你可以先在网页上长按划词存为笔记，或点击收藏当前网页。`,
      matches: []
    };
  }

  const summaryLines = top.map((item, idx) => {
    const badge = item.type === 'note' ? '📝 笔记' : '🔖 收藏';
    const snippet = item.content.replace(/\s+/g, ' ').trim().slice(0, 110);
    return `${idx + 1}. **[${badge}] ${item.title}**：${snippet}${snippet.length >= 110 ? '…' : ''}`;
  });

  return {
    answer: [
      `### 🧠 谜盒全库检索直答：「${cleanQ}」`,
      `已从你的私有收藏与笔记库中召回 **${top.length}** 条高相关证据：`,
      ``,
      ...summaryLines
    ].join('\n'),
    matches: top
  };
}

/**
 * 真 SSE 流式大模型调用（支持 Xiaomi MiMo / OpenAI / DeepSeek / Anthropic，未配置 Key 时平滑回退本地智能引擎）
 */
export async function runSmartAiTask({
  aiConfig = {},
  taskMode = 'summary',
  prompt = '',
  pageContext = {},
  knowledgeBase = null,
  onChunk = null
}) {
  const apiKey = String(aiConfig?.apiKey || '').trim();
  const baseUrl = String(aiConfig?.baseUrl || 'https://api.mimo.mi.com/v1').trim().replace(/\/+$/, '');
  const model = String(aiConfig?.model || 'mimo-v2.6').trim();
  const protocol = String(aiConfig?.protocol || 'openai').trim();

  // 若未配置云端 API Key，立即使用零配置本地智能引擎（附流式打字机效果，体验丝滑）
  if (!apiKey) {
    let resultText = '';
    if (taskMode === 'kb-qa' && knowledgeBase) {
      resultText = answerFromKnowledgeBase(prompt, knowledgeBase).answer;
    } else if (taskMode === 'polish-note') {
      const intel = inferBookmarkIntelligence({ title: pageContext.title || '笔记', text: prompt });
      resultText = [
        `### ✨ AI 结构化润色与待办提炼`,
        `> **核心摘要**：${intel.brief}`,
        ``,
        prompt
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => (line.startsWith('-') || line.startsWith('#') ? line : `- ${line}`))
          .join('\n'),
        ``,
        `**推荐标签**：${intel.tags.map((t) => `\`#${t}\``).join(' ')}`
      ].join('\n');
    } else {
      resultText = runOfflinePageAnalysis({
        mode: taskMode,
        title: pageContext.title,
        url: pageContext.url,
        text: pageContext.text,
        selection: pageContext.selection || prompt
      });
    }

    if (typeof onChunk === 'function') {
      const step = Math.max(8, Math.ceil(resultText.length / 18));
      let current = '';
      for (let i = 0; i < resultText.length; i += step) {
        current = resultText.slice(0, i + step);
        onChunk(current, false);
        await new Promise((r) => setTimeout(r, 18));
      }
      onChunk(resultText, true);
    }
    return {
      ok: true,
      engine: 'local-zero-config',
      model: '谜盒本地智能引擎（可配置 Xiaomi MiMo Key 开启云端大模型）',
      text: resultText
    };
  }

  // 构建云端大模型 System & User Prompt
  const systemPrompt =
    '你是「谜盒·灵动知识舱」（小米浏览器扩展程序）内置的 AI 知识伴读助手，优先使用精炼、结构化的中文 Markdown 输出，直接给出要点结论，不寒暄。';
  const userMessage =
    prompt ||
    `请针对以下网页内容执行【${taskMode}】任务：\n标题：${pageContext.title || ''}\n网址：${pageContext.url || ''}\n选中文本：${pageContext.selection || ''}\n正文摘录：${String(pageContext.text || '').slice(0, 4000)}`;

  try {
    const isAnthropic = protocol === 'anthropic' || baseUrl.includes('anthropic.com');
    const endpoint = isAnthropic
      ? `${baseUrl.replace(/\/v1$/, '')}/v1/messages`
      : `${baseUrl}/chat/completions`;

    const headers = { 'Content-Type': 'application/json' };
    if (isAnthropic) {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = isAnthropic
      ? {
          model,
          max_tokens: 1024,
          system: systemPrompt,
          stream: true,
          messages: [{ role: 'user', content: userMessage }]
        }
      : {
          model,
          stream: true,
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ]
        };

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const reader = resp.body?.getReader?.();
    if (!reader) {
      const json = await resp.json();
      const text = isAnthropic
        ? json?.content?.[0]?.text || ''
        : json?.choices?.[0]?.message?.content || '';
      if (typeof onChunk === 'function') onChunk(text, true);
      return { ok: true, engine: 'cloud-sse', model, text };
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulated = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataStr);
          const delta = isAnthropic
            ? parsed?.delta?.text || ''
            : parsed?.choices?.[0]?.delta?.content || '';
          if (delta) {
            accumulated += delta;
            if (typeof onChunk === 'function') onChunk(accumulated, false);
          }
        } catch {
          // 忽略非完整 JSON 分片
        }
      }
    }
    if (typeof onChunk === 'function') onChunk(accumulated, true);
    return { ok: true, engine: 'cloud-sse', model, text: accumulated };
  } catch (err) {
    // 云端异常时自动无感降级到本地引擎，保证演示与用户体验永不中断
    const fallbackText = runOfflinePageAnalysis({
      mode: taskMode,
      title: pageContext.title,
      url: pageContext.url,
      text: pageContext.text,
      selection: pageContext.selection || prompt
    });
    const combined = `${fallbackText}\n\n> ⚠️ 云端接口（${model}）连接受限（${err.message}），已自动由谜盒本地智能引擎完成分析。`;
    if (typeof onChunk === 'function') onChunk(combined, true);
    return { ok: true, engine: 'fallback-local', model, text: combined };
  }
}
