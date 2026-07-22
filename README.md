# StyleSlice

把任意设计参考图稳定转换为可复用的视觉规范与固定版式色卡。

仓库只保留一个统一技能：[`skill/`](skill/)。它已经合并原来的图片风格分析与色卡生成流程，统一由 `$styleslice` 调用。

## 同事最快使用方式

安装技能：

```bash
npx skills add https://github.com/prucezheng/styleslice/tree/main/skill -g -a codex -y
```

使用 Claude Code 或 Cursor 时，把 `codex` 替换为对应工具名；省略 `-a codex` 可交互选择安装目标。

然后在 Codex、Claude Code、Cursor 等支持 Agent Skills 的工具中上传图片并输入：

```text
使用 $styleslice 给这张图生成色卡
```

需要完整视觉分析时输入：

```text
使用 $styleslice 分析这些图片，并生成完整风格规范和色卡
```

## 固定输出

| 模式 | 输出 |
| --- | --- |
| 默认色卡 | PNG、可编辑 SVG、颜色 Token JSON |
| 仅分析 | 分析 JSON、视觉规范 Markdown |
| 完整流程 | 上述全部五项文件 |

默认色卡采用固定 1680 × 945 模板、四个语义色、八阶色阶、固定组件状态和自动验收。同一图片重复执行会得到一致的颜色 JSON 与 SVG，不使用随机生成式绘图。

## 仓库开发者调用

```bash
# 固定色卡
uv run --with pillow --with numpy skill/scripts/styleslice.py image.png \
  --output-dir outputs

# 完整分析与色卡；先在 app/ 配置 ARK_API_KEY、ARK_MODEL 并启动服务
uv run --with pillow --with numpy skill/scripts/styleslice.py image.png \
  --mode full --output-dir outputs
```

技能规则、脚本和契约全部封装在 [`skill/`](skill/) 内；应用代码仍位于 [`app/`](app/)。
