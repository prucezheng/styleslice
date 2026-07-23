"use client";

import { ChangeEvent, DragEvent, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ensureAnonymousAuth, getCachedUserId } from "@/lib/client-auth";

type Confidence = "high" | "medium" | "low";

interface ColorRule {
  name: string;
  hex: string;
  role: "primary" | "secondary" | "background" | "accent";
  proportion: string;
  confidence: Confidence;
  evidenceImages: number[];
}

interface VisualRule {
  value: string;
  confidence: Confidence;
}

interface StyleResult {
  styleId: string;
  name: string;
  summary: string;
  keywords?: { word: string; meaning: string }[];
  colors?: ColorRule[];
  layout?: {
    density?: VisualRule;
    whitespace?: VisualRule;
    grid?: VisualRule;
  };
  shapes?: {
    corners?: VisualRule;
    borders?: VisualRule;
    form?: VisualRule;
  };
  effects?: {
    shadow?: VisualRule;
    texture?: VisualRule;
  };
  markdown: string;
  prompt?: string;
  fallback?: boolean;
  fallbackReason?: string;
  source?: {
    imageIds: string[];
    primaryImageIds: string[];
  };
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface UploadedImage {
  imageId: string;
  name: string;
  size: number;
}

type View = "home" | "archive" | "detail";
type Stage = "idle" | "uploading" | "analyzing" | "saving" | "done";

const USER_ID = "SLICE";

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function colorAt(style: StyleResult, index: number, fallback: string) {
  return style.colors?.[index]?.hex ?? fallback;
}

function downloadText(fileName: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 回退方案
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return true;
  }
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<UploadedImage[]>([]);
  const [styles, setStyles] = useState<StyleResult[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<StyleResult | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canAnalyze = files.length > 0 && stage !== "uploading" && stage !== "analyzing" && stage !== "saving";

  /** 所有 API 请求带上匿名用户 ID */
  function authHeaders(): Record<string, string> {
    const uid = getCachedUserId();
    return uid ? { "x-user-id": uid } : {};
  }

  // 首次打开：静默匿名登录
  useEffect(() => {
    ensureAnonymousAuth()
      .then(() => setAuthReady(true))
      .catch((err) => {
        setMessage(`登录失败：${err instanceof Error ? err.message : String(err)}`);
        setAuthReady(true); // 即使失败也允许使用 demo
      });
  }, []);

  useEffect(() => {
    loadStyles();
  }, []);

  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  const activeStyle = selectedStyle ?? styles[0] ?? null;

  const stageText = useMemo(() => {
    if (stage === "uploading") return "Uploading images";
    if (stage === "analyzing") return "Analyzing visual language";
    if (stage === "saving") return "Saving to archive";
    if (stage === "done") return "Ready";
    return "Start Analysis";
  }, [stage]);

  async function loadStyles() {
    try {
      const res = await fetch("/api/styles", { cache: "no-store", headers: authHeaders() });
      if (!res.ok) throw new Error("资料库读取失败");
      const data = await res.json();
      const nextStyles: StyleResult[] = data.styles ?? [];
      setStyles(nextStyles);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "资料库读取失败");
    }
  }

  function chooseFiles(nextFiles: File[]) {
    previews.forEach((url) => URL.revokeObjectURL(url));
    const accepted = nextFiles.filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type));
    setFiles(accepted.slice(0, 10));
    setPreviews(accepted.slice(0, 10).map((file) => URL.createObjectURL(file)));
    setUploaded([]);
    setMessage(accepted.length === nextFiles.length ? "" : "已忽略不支持的文件，仅支持 JPG / PNG / WebP");
    setStage("idle");
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    chooseFiles(Array.from(event.target.files ?? []));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    chooseFiles(Array.from(event.dataTransfer.files ?? []));
  }

  async function startAnalysis() {
    if (!canAnalyze) {
      setMessage("请先导入参考图片");
      return;
    }
    setMessage("");
    try {
      setStage("uploading");
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const uploadRes = await fetch("/api/upload", { method: "POST", body: form });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.images?.length) {
        throw new Error(uploadData.error ?? "图片上传失败");
      }
      setUploaded(uploadData.images);

      const imageIds = uploadData.images.map((image: UploadedImage) => image.imageId);
      setStage("analyzing");
      const analysisRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds, primaryImageIds: [imageIds[0]] }),
      });
      let analysis: StyleResult;
      try {
        const text = await analysisRes.text();
        analysis = JSON.parse(text) as StyleResult;
      } catch {
        throw new Error("服务暂时不可用，AI 模型响应超时，请重试或刷新页面。");
      }
      if (!analysisRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = analysis as any;
        const detailStr = typeof err.detail === "string" ? `：${err.detail}` : "";
        throw new Error(`${err.error ?? "风格分析失败"}${detailStr}`);
      }
      if (analysis.fallback) {
        throw new Error(`当前结果不是大模型真实分析：${analysis.fallbackReason ?? "fallback"}`);
      }

      setStage("saving");
      const saveRes = await fetch("/api/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(analysis),
      });
      const saved = await saveRes.json();
      if (!saveRes.ok) throw new Error(saved.error ?? "保存资料库失败");

      setStage("done");
      setSelectedStyle(saved);
      setView("detail");
      await loadStyles();
    } catch (err) {
      setStage("idle");
      setMessage(err instanceof Error ? err.message : "分析失败，请重试");
    }
  }

  function goArchive() {
    loadStyles();
    setView("archive");
  }

  function openStyle(style: StyleResult) {
    setSelectedStyle(style);
    setView("detail");
  }

  return (
    <main className="stage-shell">
      <section className="phone-canvas" aria-label="StyleSlice mobile experience">
        {view === "home" && (
          <HomeScreen
            files={files}
            previews={previews}
            uploaded={uploaded}
            stageText={stageText}
            canAnalyze={canAnalyze}
            message={message}
            dragActive={dragActive}
            fileInputRef={fileInputRef}
            onArchive={goArchive}
            onFileInput={handleFileInput}
            onChooseFiles={() => fileInputRef.current?.click()}
            onDragActive={setDragActive}
            onDrop={handleDrop}
            onStart={startAnalysis}
          />
        )}

        {view === "archive" && (
          <ArchiveScreen
            styles={styles}
            onHome={() => setView("home")}
            onOpenStyle={openStyle}
          />
        )}

        {view === "detail" && activeStyle && (
          <DetailScreen style={activeStyle} onBack={goArchive} />
        )}

        {(stage === "uploading" || stage === "analyzing" || stage === "saving") && (
          <AnalyzingOverlay stage={stage} />
        )}
      </section>
    </main>
  );
}

function HomeScreen({
  files,
  previews,
  uploaded,
  stageText,
  canAnalyze,
  message,
  dragActive,
  fileInputRef,
  onArchive,
  onFileInput,
  onChooseFiles,
  onDragActive,
  onDrop,
  onStart,
}: {
  files: File[];
  previews: string[];
  uploaded: UploadedImage[];
  stageText: string;
  canAnalyze: boolean;
  message: string;
  dragActive: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onArchive: () => void;
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onChooseFiles: () => void;
  onDragActive: (active: boolean) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onStart: () => void;
}) {
  return (
    <div className="screen home-screen">
      <button className="identity-strip" type="button" onClick={onArchive} aria-label="打开资料库">
        <span className="avatar-mark" aria-hidden="true">SS</span>
        <span className="brand-chip">STYLESLICE</span>
        <span className="user-id">{USER_ID}</span>
      </button>

      <div className="home-body">
        <h1>StyleSlice</h1>
        <div
          className={`upload-zone ${dragActive ? "is-dragging" : ""} ${files.length ? "has-files" : ""}`}
          onClick={onChooseFiles}
          onDragOver={(event) => {
            event.preventDefault();
            onDragActive(true);
          }}
          onDragLeave={() => onDragActive(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onFileInput}
          />
          {previews.length ? (
            <div className={`preview-grid grid-${Math.min(previews.length, 4)}`}>
              {previews.slice(0, 4).map((src, index) => (
                <img key={src} src={src} alt={`Reference ${index + 1}`} />
              ))}
            </div>
          ) : (
            <div className="upload-empty">
              <img className="upload-add-icon" src="/icons/add.png" alt="" aria-hidden="true" />
              <strong>Upload Reference Images</strong>
              <small>Drag and drop your journal sketches or inspiration here.</small>
            </div>
          )}
        </div>

        <div className="file-readout" aria-live="polite">
          {files.length > 0 && (
            <>
              <strong>{files.length} image{files.length > 1 ? "s" : ""} selected</strong>
              <span>{files.map((file) => `${file.name} · ${formatBytes(file.size)}`).join(" / ")}</span>
            </>
          )}
          {uploaded.length > 0 && <span>{uploaded.length} images imported to analysis queue.</span>}
          {message && <span className="error-text">{message}</span>}
        </div>
      </div>

      <button className="primary-action" type="button" onClick={onStart} disabled={!canAnalyze}>
        {stageText}
      </button>
    </div>
  );
}

/** 简笔画风格的等待覆盖层：半透明 + 手绘进度条 */
function AnalyzingOverlay({ stage }: { stage: Stage }) {
  const steps = [
    { key: "uploading", label: "上传图片" },
    { key: "analyzing", label: "AI 切片中" },
    { key: "saving", label: "存入切片库" },
  ];
  const doodleHints = [
    "正在辨认颜色…",
    "观察构图与留白…",
    "归纳视觉规则…",
    "写下禁止项…",
    "标注证据来源…",
  ];
  const [hintIndex, setHintIndex] = useState(0);

  useEffect(() => {
    if (stage !== "analyzing") return;
    const timer = setInterval(() => setHintIndex((i) => (i + 1) % doodleHints.length), 2200);
    return () => clearInterval(timer);
  }, [stage]);

  const activeIndex = Math.max(0, steps.findIndex((s) => s.key === stage));
  const progress = Math.round(((activeIndex + 0.6) / steps.length) * 100);

  return (
    <div className="analyzing-overlay" role="status" aria-live="polite">
      <div className="doodle-card">
        <span className="doodle-pencil" aria-hidden="true">✎</span>
        <strong className="doodle-title">
          {stage === "analyzing" ? doodleHints[hintIndex] : steps[activeIndex].label + "…"}
        </strong>
        <div className="doodle-progress" aria-hidden="true">
          <div className="doodle-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <ol className="doodle-steps">
          {steps.map((step, index) => (
            <li
              key={step.key}
              className={index < activeIndex ? "is-done" : index === activeIndex ? "is-active" : ""}
            >
              {index < activeIndex ? "✓ " : ""}{step.label}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ArchiveScreen({
  styles,
  onHome,
  onOpenStyle,
}: {
  styles: StyleResult[];
  onHome: () => void;
  onOpenStyle: (style: StyleResult) => void;
}) {
  // 搜索过滤：名称 / 一句话定义 / 关键词
  const [query, setQuery] = useState("");
  const [front, setFront] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return styles;
    return styles.filter((style) => {
      if (style.name?.toLowerCase().includes(q)) return true;
      if (style.summary?.toLowerCase().includes(q)) return true;
      return (style.keywords ?? []).some((k) => k.word.toLowerCase().includes(q));
    });
  }, [styles, query]);

  const frontIndex = Math.min(front, Math.max(0, filtered.length - 1));

  function moveStack(direction: 1 | -1) {
    if (filtered.length <= 1) return;
    setFront((current) => (current + direction + filtered.length) % filtered.length);
  }

  // 点击空白区切换卡片：上半区 → 下一张，下半区 → 上一张
  // 点到卡片本身时忽略，交给卡片的 onClick（打开详情/切换）
  const swipeAt = useRef(0);
  const touchX = useRef<number | null>(null);

  function handleStageClick(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".slice-card")) return;
    // 滑动结束后的合成 click 不重复切换
    if (Date.now() - swipeAt.current < 400) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const isUpperHalf = event.clientY - rect.top < rect.height / 2;
    moveStack(isUpperHalf ? 1 : -1);
  }

  function handleStageTouchStart(event: TouchEvent) {
    touchX.current = event.touches[0]?.clientX ?? null;
  }

  function handleStageTouchEnd(event: TouchEvent) {
    const start = touchX.current;
    touchX.current = null;
    if (start === null) return;
    const end = event.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) < 30) return;
    swipeAt.current = Date.now();
    moveStack(delta < 0 ? 1 : -1);
  }

  return (
    <div
      className="screen archive-screen"
    >
      <div className="archive-topline">
        <button type="button" onClick={onHome} aria-label="返回首页">←</button>
        <span>资料库</span>
      </div>
      <header className="archive-title">
        <span>MY</span>
        <strong>我的<br />切片库</strong>
        <em>Archive</em>
      </header>

      <div
        className="stack-stage"
        onClick={handleStageClick}
        onTouchStart={handleStageTouchStart}
        onTouchEnd={handleStageTouchEnd}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > 8) moveStack(event.deltaY > 0 ? 1 : -1);
        }}
      >
        {styles.length === 0 ? (
          <button className="empty-stack" type="button" onClick={onHome}>
            <span>+</span>
            <strong>尚未生成切片</strong>
            <small>回到首页上传参考图片</small>
          </button>
        ) : filtered.length === 0 ? (
          <div className="empty-stack no-result">
            <span>🔍</span>
            <strong>没有找到「{query}」</strong>
            <small>换个关键词试试</small>
          </div>
        ) : (
          filtered.map((style, index) => {
            const offset = (index - frontIndex + filtered.length) % filtered.length;
            const visibleOffset = offset > filtered.length / 2 ? offset - filtered.length : offset;
            const clamped = Math.max(-3, Math.min(5, visibleOffset));
            const isFront = index === frontIndex;
            // 手绘粗描边：几种不规则圆角循环使用，标签页左右交错
            const doodleRadius = [
              "18px 26px 20px 24px / 24px 18px 26px 20px",
              "26px 16px 24px 20px / 16px 26px 18px 24px",
              "20px 24px 18px 26px / 26px 18px 24px 16px",
            ][index % 3];
            const colors = [
              colorAt(style, 0, "#f5f1ea"),
              colorAt(style, 1, "#1e1b16"),
              colorAt(style, 2, "#c4562f"),
            ];
            const sourceImageId = style.source?.primaryImageIds?.[0] ?? style.source?.imageIds?.[0];
            return (
              <button
                className={`slice-card ${isFront ? "is-front" : ""} ${index % 2 === 1 ? "tab-right" : ""}`}
                key={style.styleId}
                type="button"
                onClick={isFront ? () => onOpenStyle(style) : () => moveStack(visibleOffset > 0 ? 1 : -1)}
                style={{
                  "--stack-y": `${clamped * -28}px`,
                  "--stack-x": `${clamped * 5}px`,
                  "--stack-scale": `${1 - Math.abs(clamped) * 0.04}`,
                  "--stack-rotate": `${clamped * -1.6}deg`,
                  "--stack-z": `${80 - Math.abs(clamped)}`,
                  "--card-radius": doodleRadius,
                  "--card-a": colors[0],
                  "--card-b": colors[1],
                  "--card-c": colors[2],
                } as React.CSSProperties}
              >
                <span className="folder-tab" aria-hidden="true">
                  <em>{`SLICE-${String(index + 1).padStart(2, "0")}`}</em>
                </span>
                <div className="folder-content">
                  {sourceImageId ? (
                    <img
                      className="slice-source-image"
                      src={`/api/images/${sourceImageId}`}
                      alt={`${style.name} 原始参考图`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="slice-image-fallback" aria-label="暂无原始参考图">
                      {colors.map((color) => <span key={color} style={{ background: color }} />)}
                    </div>
                  )}
                  <footer className="slice-card-caption">
                    <span>{style.name}</span>
                    <i>OPEN ↗</i>
                  </footer>
                </div>
              </button>
            );
          })
        )}
      </div>

      {styles.length > 0 && (
        <div className="archive-controls archive-search" role="search">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            placeholder="搜索风格名称 / 关键词…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setFront(0);
            }}
            aria-label="搜索切片库"
          />
          {query ? (
            <button
              className="search-clear"
              type="button"
              onClick={() => {
                setQuery("");
                setFront(0);
              }}
              aria-label="清除搜索"
            >
              ×
            </button>
          ) : (
            <span className="search-count">{filtered.length} 个切片</span>
          )}
        </div>
      )}
    </div>
  );
}

function DetailScreen({
  style,
  onBack,
}: {
  style: StyleResult;
  onBack: () => void;
}) {
  const [boardOpen, setBoardOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const paletteName = `${style.name || "styleslice"}_palette.json`.replace(/[\\/:*?"<>|]/g, "_");
  const promptText = style.prompt ?? style.markdown;
  // 缩略展示：约 4 行以内无需展开按钮
  const isLongPrompt = promptText.length > 180;

  const handleCopy = async () => {
    const ok = await copyToClipboard(promptText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="screen detail-screen">
      <header className="detail-topbar">
        <button className="back-link" type="button" onClick={onBack}>
          <img src="/icons/back-arrow.svg" alt="" aria-hidden="true" />
          <span>返回库</span>
        </button>
      </header>

      <main className="detail-content">
        <section className="summary-block">
          <h1>{style.name}</h1>
          <p>{style.summary}</p>
          {style.fallback && <span className="fallback-pill">DEMO · {style.fallbackReason ?? "fallback"}</span>}
        </section>

        <section className="detail-section palette-section">
          <h2 className="section-label">色卡</h2>
          <button
            className="style-card-board-frame"
            type="button"
            onClick={() => setBoardOpen(true)}
            aria-label="放大查看完整 Style Card"
          >
            <StyleCardBoard style={style} />
            <span className="board-expand-hint">点击放大 ↗</span>
          </button>
        </section>

        <section className="detail-section prompt-section">
          <h2 className="section-label">AI 生图提示词</h2>
          <div className={`prompt-card ${!promptExpanded && isLongPrompt ? "is-clamped" : ""}`}>
            <p>{promptText}</p>
            {!promptExpanded && isLongPrompt && <span className="prompt-fade" aria-hidden="true" />}
          </div>
          {isLongPrompt && (
            <button
              className="prompt-toggle"
              type="button"
              onClick={() => setPromptExpanded((open) => !open)}
            >
              {promptExpanded ? "收起 ▲" : `展开全文（${Math.round(promptText.length / 100) * 100} 字）▼`}
            </button>
          )}
        </section>

        <div className="download-actions">
          <button type="button" onClick={handleCopy} className={copied ? "copied" : ""}>
            <span>{copied ? "✓ 已复制" : "📋 复制提示词"}</span>
          </button>
          <button
            type="button"
            onClick={() => downloadText(
              paletteName,
              JSON.stringify(style.colors ?? [], null, 2),
              "application/json;charset=utf-8"
            )}
          >
            <img src="/icons/download-palette.png" alt="" aria-hidden="true" />
            <span>下载色卡</span>
          </button>
        </div>
      </main>

      {boardOpen && createPortal((
        <div className="board-lightbox" role="dialog" aria-modal="true" aria-label="完整 Style Card">
          <button className="board-lightbox-close" type="button" onClick={() => setBoardOpen(false)}>
            CLOSE ×
          </button>
          <div className="board-lightbox-canvas">
            <StyleCardBoard style={style} expanded />
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

type BoardRole = "primary" | "secondary" | "neutral" | "accent";

interface BoardColor {
  role: BoardRole;
  label: string;
  name: string;
  hex: string;
  proportion: number;
}

function normalizeHex(value: string | undefined, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? (value as string).toUpperCase() : fallback;
}

function mixHex(base: string, target: string, amount: number) {
  const parse = (value: string) => [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
  const a = parse(base);
  const b = parse(target);
  return `#${a.map((value, index) => Math.round(value * (1 - amount) + b[index] * amount).toString(16).padStart(2, "0")).join("")}`;
}

function percentage(value: string | undefined, fallback: number) {
  const parsed = Number((value ?? "").match(/[\d.]+/)?.[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function styleBoardColors(style: StyleResult): BoardColor[] {
  const source = style.colors ?? [];
  const used = new Set<ColorRule>();
  const take = (roles: ColorRule["role"][], fallbackIndex: number) => {
    const exact = source.find((color) => roles.includes(color.role) && !used.has(color));
    const candidate = exact ?? source.find((color) => !used.has(color)) ?? source[fallbackIndex];
    if (candidate) used.add(candidate);
    return candidate;
  };
  const primary = take(["primary"], 0);
  const secondary = take(["secondary"], 1);
  const neutral = take(["background"], 2);
  const accent = take(["accent"], 3);
  const fallbacks = [
    { hex: "#4AA384", name: "Leaf Green", proportion: 60 },
    { hex: "#F5C95A", name: "Sunshine Yellow", proportion: 25 },
    { hex: "#F8F3E5", name: "Warm Cream", proportion: 10 },
    { hex: "#D94B45", name: "Coral Red", proportion: 5 },
  ];
  const candidates = [primary, secondary, neutral, accent];
  const roles: BoardRole[] = ["primary", "secondary", "neutral", "accent"];
  return roles.map((role, index) => ({
    role,
    label: role[0].toUpperCase() + role.slice(1),
    name: candidates[index]?.name || fallbacks[index].name,
    hex: normalizeHex(candidates[index]?.hex, fallbacks[index].hex),
    proportion: percentage(candidates[index]?.proportion, fallbacks[index].proportion),
  }));
}

function StyleCardBoard({ style, expanded = false }: { style: StyleResult; expanded?: boolean }) {
  const colors = styleBoardColors(style);
  const [primary, secondary, neutral, accent] = colors;
  const keywords = (style.keywords ?? []).map((keyword) => keyword.word).slice(0, 4);
  while (keywords.length < 4) keywords.push(["Warm", "Clear", "Balanced", "Everyday"][keywords.length]);
  const shades = (hex: string) => [0.86, 0.72, 0.56, 0.38, 0.2, 0, -0.16, -0.32].map((amount) => (
    amount >= 0 ? mixHex(hex, "#FFFFFF", amount) : mixHex(hex, "#111111", Math.abs(amount))
  ));
  const boardStyle = {
    "--board-primary": primary.hex,
    "--board-secondary": secondary.hex,
    "--board-neutral": neutral.hex,
    "--board-accent": accent.hex,
  } as React.CSSProperties;

  const keywordIcons = ["♡", "◉", "☼", "♧"];
  const keywordColors = [primary.hex, secondary.hex, neutral.hex, accent.hex];

  return (
    <div className={`style-card-board ${expanded ? "is-expanded" : ""}`} style={boardStyle}>
      {/* 1. Color System — left column */}
      <div className="board-token-column">
        {colors.map((color) => (
          <article className="board-panel board-token" key={color.role}>
            <header>
              <i style={{ background: color.hex }} />
              <strong>{color.label} — {color.name}</strong>
              <span>{color.hex}</span>
            </header>
            <div className="board-main-swatch" style={{ background: color.hex }} />
            <div className="board-shade-row">
              {shades(color.hex).map((shade, index) => (
                <span key={shade}>
                  <i style={{ background: shade }} />
                  <small>{(index + 1) * 100}</small>
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>

      {/* 2 & 3. Color Usage + Design Keywords — right column */}
      <div className="board-right-column">
        <article className="board-panel board-usage">
          <h3>Color Usage</h3>
          <div className="board-usage-bar">
            {colors.map((color) => (
              <span key={color.role} style={{ flex: color.proportion, background: color.hex }} />
            ))}
          </div>
          <div className="board-usage-legend">
            {colors.map((color) => (
              <div className="board-usage-row" key={color.role}>
                <b style={{ background: color.hex }} />
                <strong>{color.label}</strong>
                <span>{color.proportion}%</span>
              </div>
            ))}
          </div>
        </article>

        <article className="board-panel board-keywords">
          <h3>Design Keywords</h3>
          <div className="board-keywords-row">
            {keywords.map((keyword, index) => (
              <span key={`${keyword}-${index}`}>
                <i style={{
                  background: `color-mix(in srgb, ${keywordColors[index]} 14%, white)`,
                  color: keywordColors[index],
                }}>{keywordIcons[index]}</i>
                <small>{keyword}</small>
              </span>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

