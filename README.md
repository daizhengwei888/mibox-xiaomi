# 谜盒·划词笔记 (`mibox-xiaomi`)

> **小米浏览器 Vibe Coding 大赛 · 创意扩展程序赛道参赛专版**  
> 基于 [daizhengwei888/mibox](https://github.com/daizhengwei888/mibox) 核心架构深度重构，100% 遵循小米浏览器官方 `mibrowser-extension-dev` (`SKILL.md v4-fixed`) 双端开发规范。

---

## 一、核心定位与五大移动端创新

针对**小米浏览器（手机与 Pad 双端）**无桌面右键菜单（`contextMenus`）、无物理快捷键（`Alt+Shift+K`）及移动触控阅读痛点，打造**触控优先的 AI 伴读与私有知识舱**：

1. **网页触控灵动胶囊 & 移动端长按划词 AI 浮条（`src/content/touch-assistant.js`）**
   - 在授权网页右下角提供半隐藏**「谜盒灵动胶囊」**，实时显示预计阅读时长与当前护眼模式，点击即在当前页底部展开速查抽屉。
   - 手指在网页长按选中文字后自动弹出 **44px+ 高触控区浮条**，一键完成**「📝 存笔记」**、**「✨ AI 精读」**、**「🌐 双语解析」**与**「📋 复制」**。
2. **四档全局护眼阅读跨标签秒同步 & DNR 省流净图（`reading.css` + `declarativeNetRequest`）**
   - 提供**「原生网页 / 暖纸护眼 / 深色夜读 / 墨水屏」**四档全局阅读主题及 `100% / 115% / 130%` 正文字号缩放，严格使用正文容器白名单选择器，基于 `chrome.storage.onChanged` 实现所有已打开匹配标签页毫秒级同步。
   - 内置基于 `chrome.declarativeNetRequest.updateDynamicRules` 的 **DNR 省流净图引擎**，一键过滤网页冗余广告图片路径。
3. **Xiaomi MiMo 首席预置 + 本地零配置双核 AI 引擎（`src/shared/ai-engine.js`）**
   - 首席预置大赛官方生态 **Xiaomi MiMo（`https://api.mimo.mi.com/v1` / `mimo-v2.6`）** 流式接口，同时兼容 DeepSeek、OpenAI 与 Anthropic Claude。
   - 独创**「零配置本地智能引擎 + 云端真 SSE 流式大模型」双核架构**：评委与用户导入 ZIP 后**无需填写任何 API Key 即可开箱体验**网页三要点提炼、智能分组标签推荐、划词解读与 `? 问题` 全库检索直答；填入 API Key 后自动无缝升级为云端流式推理。
4. **手机 (`compact`) / Pad (`wide`) 动态响应式双端 UI 与五套高定皮肤（`src/shared/viewport.js`）**
   - 严格按照 `SKILL.md §0` 标准测量 `pageWidth = document.documentElement.clientWidth || innerWidth` 与 `layout = pageWidth >= 600 ? "wide" : "compact"`，监听屏幕旋转与平板分屏：
     - **手机端 (`< 600px`)**：底部拇指导航栏 + 底部伴读抽屉（`sidePanel`）；Popup 严格遵循 `min-width: min(280px, 100vw); max-width: 420px;`，所有按钮 `min-height: 44px`。
     - **Pad 端 (`>= 600px`)**：左侧导航 + 双栏主从分屏工作台。
   - 针对手机 / Pad 差异（`SKILL.md §3`）：数据导出在手机端调用 `chrome.downloads.download` 生成文件，在 Pad 端（无 `downloads` API）自动提供实时 JSON / Markdown 预览框与一键复制。
5. **WebCrypto AES-256-GCM 零知识隐私保险箱（`src/shared/crypto.js`）**
   - 采用浏览器原生 `SubtleCrypto` 执行 **210,000 次 `PBKDF2-SHA256` 密钥派生 + `AES-256-GCM` 认证加密**（绑定记录 ID 作为 AAD 附加认证数据），支持 64 位十六进制恢复密钥无损重置主密码、30 秒剪贴板自动清空与 `chrome.alarms` 定时自动锁定。

---

## 二、小米浏览器（手机 / Pad）导入与测试步骤

1. 将打包产物 `dist/mibox-xiaomi-1.3.0.zip` 发送至小米手机或小米平板（Pad）可访问的本地文件夹。
2. 打开**小米浏览器 → 扩展程序页 → 导入本地扩展文件**，直接选择 `mibox-xiaomi-1.3.0.zip` 导入（无需手动解压）。
3. 确认「谜盒·划词笔记」已启用，打开任意网页并刷新：
   - 点击网页右下角**橙色「谜盒 · X分」灵动胶囊**，切换「暖纸 / 夜读 / 墨水屏」或点击「AI 提炼本页三要点」。
   - 在网页长按选中一段文字，点击底部弹出的**划词 AI 浮条**体验「存笔记 / AI 精读」。
   - 从浏览器扩展入口打开 **Popup 快捷舱**、**伴读抽屉（`sidePanel`）**与**全屏灵动知识舱（`app.html`）**。

---

## 三、大赛创作中心提交可直接粘贴的资料文案

- **扩展程序名称（2–16 字，必填）**：
  ```text
  谜盒·划词笔记
  ```
- **扩展程序描述（1–1000 字，必填）**：
  ```text
  【面向场景与核心价值】
  在手机与平板上使用小米浏览器深度阅读、查资料时，用户常面临三大痛点：移动端没有桌面右键菜单与物理快捷键，划词摘录和查资料极不顺手；不同网页夜间强光刺眼、广告大图耗流；零散收藏、阅读笔记与私密账号分散在多处难以检索。
  「谜盒·划词笔记」专为小米浏览器（手机与 Pad 双端）量身打造，将 AI 伴读、全局护眼净网、智能收藏、Markdown 闪念笔记与 AES-256-GCM 零知识加密保险箱融为一体，所有数据 100% 存储在用户本地设备。

  【五大核心功能】
  1. 网页触控灵动胶囊与长按划词 AI 浮条：在授权网页右下角提供贴边灵动胶囊，实时估算阅读时长并一键唤出页内速查抽屉；手指长按选中网页文字即弹出 44px 高触控浮条，一键「存为笔记 / AI 精读 / 双语解析 / 复制」，彻底补齐移动端无右键菜单与快捷键的交互短板。
  2. 四档全局护眼阅读跨标签秒同步 & DNR 净图：提供「原生 / 暖纸护眼 / 深色夜读 / 墨水屏」四档全局阅读主题与正文字号缩放（对所有授权网站生效），基于 storage.onChanged 实现多标签页毫秒级同步；内置 declarativeNetRequest 动态规则一键拦截网页冗余广告图片。
  3. Xiaomi MiMo 首席预置 + 本地零配置双核 AI：预置 Xiaomi MiMo 大模型流式网关（兼容 DeepSeek/OpenAI/Claude），并内建零配置本地智能引擎——安装后无需配置 API Key 即可开箱提炼网页核心三要点、自动生成收藏一句话简介与分类标签，并支持输入「? 问题」对全库收藏与笔记进行检索直答。
  4. 手机/Pad 双端自适应与五套高定皮肤：按容器宽度（600px 阈值）在手机底部拇指导航/底部伴读抽屉与 Pad 双栏分屏工作台间无缝切换；数据导出在手机端调用 downloads 下载文件，在 Pad 端自动提供实时预览与一键复制。
  5. WebCrypto 零知识保险箱：采用 PBKDF2-SHA256（21 万次迭代）+ AES-256-GCM 加密保护密码与 API Key，支持 64 位恢复密钥重置、30 秒剪贴板自动清理与定时自动锁定。

  【权限与适用范围说明】
  本扩展使用 storage（本地存储与跨标签同步）、tabs/scripting（当前页摘要提取、可见页截图入笔记与护眼样式同步）、sidePanel（手机底部伴读抽屉/Pad侧栏）、alarms（保险箱自动锁定）、declarativeNetRequest（用户可选的净图过滤）及 downloads（手机端可选备份导出），适用于 http/https 网页。
  ```

---

## 四、开发、校验与打包命令

```sh
sh scripts/check.sh            # 运行语法检查 + 单元测试 + 打包 ZIP + 小米大赛 rw()/SKILL.md 合规审计
node scripts/e2e-verify.mjs    # 使用 Playwright 真实加载扩展验证手机/Pad 视口并生成 1080x1440 预览图
sh scripts/pack.sh             # 单独打包 dist/mibox-xiaomi-1.3.0.zip
```

### 真机录屏一键转码为参赛标准（3:4 竖版 `1080×1440`、`≤ 5MB`、`< 15 秒` MP4）

在小米手机或 Pad 上录制完真实运行视频 `raw.mp4` 后，可使用以下 `ffmpeg` 命令一键裁剪/缩放至大赛最佳规格：

```sh
ffmpeg -y -i raw.mp4 -t 13 -vf "scale=1080:1440:force_original_aspect_ratio=decrease,pad=1080:1440:(ow-iw)/2:(oh-ih)/2:color=#0c1017,fps=30" -c:v libx264 -crf 26 -preset medium -pix_fmt yuv420p -movflags +faststart -an outputs/mibox-xiaomi-contest-demo.mp4
```

---

## 许可证

[MIT](LICENSE) © 2026 David
