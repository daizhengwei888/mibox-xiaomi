# 谜盒·划词笔记 (`mibox-xiaomi`)

给小米浏览器（手机 / 平板）用的扩展：读网页时长按选字，就能存笔记、解释、翻译。

在手机上读文章，看到想留的段落，通常只能截图或者复制进备忘录，过几天就找不到出处了。电脑上靠右键菜单和快捷键做的事，手机上都做不了。谜盒在网页底部补上一条操作栏，单手就能点到。

## 主要功能

**长按选字，底部弹出操作条**（`src/content/touch-assistant.js`）
- 存笔记：原文连同网页标题、链接一起保存
- 解释 / 翻译：结果直接显示在页面里，不用切换 App
- 复制

**阅读模式**（`src/content/reading.css`）
- 原生、暖纸、夜读、墨水屏四种，字号可调到 115% / 130%
- 通过 `chrome.storage.onChanged` 同步，已打开的标签页一起切换

**其他**
- 收藏网页时自动生成一句话简介、分组和预计阅读时长
- 屏蔽广告图片（`declarativeNetRequest`），省流量
- 加密保险箱（放在「设置 → 更多」里）：PBKDF2-SHA256 210,000 次 + AES-256-GCM，本地加密，闲置自动锁定

数据只存在本机 `chrome.storage.local`，不需要注册。不填 API Key 时，解释和要点由本地规则提取，可以离线用；填入 MiMo 或其他 OpenAI 兼容接口的 Key 后，交给大模型生成。

手机（页面宽度 < 600px）用底部导航，平板（≥ 600px）自动切到左侧导航的宽屏布局。

## 在小米浏览器上安装

1. 把 `dist/mibox-xiaomi-1.1.1.zip` 传到手机或平板。
2. 小米浏览器 → 扩展程序 → 导入本地扩展，选这个 ZIP（不用解压）。
3. 打开任意文章页并刷新：
   - 长按选中一段文字，底部出现「存笔记 / 解释 / 翻译 / 复制」
   - 点右下角「谜盒 · X分」胶囊，切换阅读模式或看本页要点
   - 从扩展入口打开弹窗，点「打开完整页面」查看全部笔记

## 参赛提交资料

- **名称**：谜盒·划词笔记
- **描述**：见 [`docs/contest-description.txt`](docs/contest-description.txt)

## 开发

```sh
sh scripts/check.sh            # 运行语法检查 + 单元测试 + 打包 ZIP + 参赛包规格检查
node scripts/e2e-verify.mjs    # 使用 Playwright 真实加载扩展验证手机/Pad 视口并生成 1080x1440 预览图
sh scripts/pack.sh             # 单独打包 dist/mibox-xiaomi-1.1.1.zip
```

### 录屏转成参赛规格（3:4、1080×1440、≤ 5MB、< 15 秒）

手机录屏得到 `raw.mp4` 后：

```sh
ffmpeg -y -i raw.mp4 -t 13 -vf "scale=1080:1440:force_original_aspect_ratio=decrease,pad=1080:1440:(ow-iw)/2:(oh-ih)/2:color=#0c1017,fps=30" -c:v libx264 -crf 26 -preset medium -pix_fmt yuv420p -movflags +faststart -an outputs/mibox-xiaomi-contest-demo.mp4
```

---

## 许可证

[MIT](LICENSE) © 2026 David
