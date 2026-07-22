"use client";

import { ChangeEvent, DragEvent, TouchEvent, useEffect, useMemo, useRef, useState } from "react";

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

type View = "home" | "archive" | "detail" | "md";
type Stage = "idle" | "uploading" | "analyzing" | "saving" | "done";

const USER_ID = "3036321351";

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function roleName(role: ColorRule["role"]) {
  return {
    primary: "主色",
    secondary: "辅助",
    background: "背景",
    accent: "强调",
  }[role];
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

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<UploadedImage[]>([]);
  const [styles, setStyles] = useState<StyleResult[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<StyleResult | null>(null);
  const [frontIndex, setFrontIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canAnalyze = files.length > 0 && stage !== "uploading" && stage !== "analyzing" && stage !== "saving";

  useEffect(() => {
    loadStyles();
  }, []);

  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  const activeStyle = selectedStyle ?? styles[frontIndex] ?? null;

  const stageText = useMemo(() => {
    if (stage === "uploading") return "Uploading images";
    if (stage === "analyzing") return "Analyzing visual language";
    if (stage === "saving") return "Saving to archive";
    if (stage === "done") return "Ready";
    return "Start Analysis";
  }, [stage]);

  async function loadStyles() {
    try {
      const res = await fetch("/api/styles", { cache: "no-store" });
      if (!res.ok) throw new Error("资料库读取失败");
      const data = await res.json();
      const nextStyles: StyleResult[] = data.styles ?? [];
      setStyles(nextStyles);
      setFrontIndex((current) => Math.min(current, Math.max(0, nextStyles.length - 1)));
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
      const analysis = await analysisRes.json();
      if (!analysisRes.ok) {
        const detail = typeof analysis.detail === "string" ? `：${analysis.detail}` : "";
        throw new Error(`${analysis.error ?? "风格分析失败"}${detail}`);
      }
      if (analysis.fallback) {
        throw new Error(`当前结果不是大模型真实分析：${analysis.fallbackReason ?? "fallback"}`);
      }

      setStage("saving");
      const saveRes = await fetch("/api/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  function openFrontStyle() {
    const style = styles[frontIndex];
    if (!style) return;
    setSelectedStyle(style);
    setView("detail");
  }

  function moveStack(direction: 1 | -1) {
    if (styles.length <= 1) return;
    setFrontIndex((current) => (current + direction + styles.length) % styles.length);
  }

  function handleArchiveTouchStart(event: TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleArchiveTouchEnd(event: TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const end = event.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) < 34) return;
    moveStack(delta < 0 ? 1 : -1);
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
            frontIndex={frontIndex}
            onHome={() => setView("home")}
            onOpen={openFrontStyle}
            onMove={moveStack}
            onTouchStart={handleArchiveTouchStart}
            onTouchEnd={handleArchiveTouchEnd}
          />
        )}

        {view === "detail" && activeStyle && (
          <DetailScreen style={activeStyle} onBack={goArchive} onOpenMd={() => setView("md")} />
        )}

        {view === "md" && activeStyle && (
          <MarkdownScreen style={activeStyle} onBack={() => setView("detail")} />
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
        <span className="avatar-mark">新</span>
        <span className="brand-chip">NEWBORN CARE</span>
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
            <div className="preview-grid">
              {previews.slice(0, 4).map((src, index) => (
                <img key={src} src={src} alt={`Reference ${index + 1}`} />
              ))}
            </div>
          ) : (
            <div className="upload-empty">
              <span>+</span>
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

function ArchiveScreen({
  styles,
  frontIndex,
  onHome,
  onOpen,
  onMove,
  onTouchStart,
  onTouchEnd,
}: {
  styles: StyleResult[];
  frontIndex: number;
  onHome: () => void;
  onOpen: () => void;
  onMove: (direction: 1 | -1) => void;
  onTouchStart: (event: TouchEvent) => void;
  onTouchEnd: (event: TouchEvent) => void;
}) {
  return (
    <div className="screen archive-screen">
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
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > 8) onMove(event.deltaY > 0 ? 1 : -1);
        }}
      >
        {styles.length === 0 ? (
          <button className="empty-stack" type="button" onClick={onHome}>
            <span>+</span>
            <strong>尚未生成切片</strong>
            <small>回到首页上传参考图片</small>
          </button>
        ) : (
          styles.map((style, index) => {
            const offset = (index - frontIndex + styles.length) % styles.length;
            const visibleOffset = offset > styles.length / 2 ? offset - styles.length : offset;
            const clamped = Math.max(-3, Math.min(5, visibleOffset));
            const isFront = index === frontIndex;
            const colors = [
              colorAt(style, 0, "#f5f1ea"),
              colorAt(style, 1, "#1e1b16"),
              colorAt(style, 2, "#c4562f"),
            ];
            return (
              <button
                className={`slice-card ${isFront ? "is-front" : ""}`}
                key={style.styleId}
                type="button"
                onClick={isFront ? onOpen : () => onMove(visibleOffset > 0 ? 1 : -1)}
                style={{
                  "--stack-y": `${clamped * -28}px`,
                  "--stack-x": `${clamped * 5}px`,
                  "--stack-scale": `${1 - Math.abs(clamped) * 0.04}`,
                  "--stack-rotate": `${clamped * -1.6}deg`,
                  "--stack-z": `${80 - Math.abs(clamped)}`,
                  "--card-a": colors[0],
                  "--card-b": colors[1],
                  "--card-c": colors[2],
                } as React.CSSProperties}
              >
                <span className="slice-badge">StyleSlice</span>
                <strong>{style.name}</strong>
                <small>{style.summary}</small>
                <div className="mini-palette">
                  {colors.map((color) => <span key={color} style={{ background: color }} />)}
                </div>
              </button>
            );
          })
        )}
      </div>

      {styles.length > 0 && (
        <nav className="archive-controls" aria-label="资料库切换">
          <button type="button" onClick={() => onMove(-1)}>Prev</button>
          <span>{frontIndex + 1} / {styles.length}</span>
          <button type="button" onClick={() => onMove(1)}>Next</button>
        </nav>
      )}
    </div>
  );
}

function DetailScreen({
  style,
  onBack,
  onOpenMd,
}: {
  style: StyleResult;
  onBack: () => void;
  onOpenMd: () => void;
}) {
  const mdName = `${style.name || "styleslice"}_spec.md`.replace(/[\\/:*?"<>|]/g, "_");
  const paletteName = `${style.name || "styleslice"}_palette.json`.replace(/[\\/:*?"<>|]/g, "_");

  return (
    <div className="screen detail-screen">
      <button className="back-link" type="button" onClick={onBack}>← BACK TO ARCHIVE</button>

      <section className="summary-block">
        <h1>{style.name}</h1>
        <p>{style.summary}</p>
        {style.fallback && <span className="fallback-pill">DEMO · {style.fallbackReason ?? "fallback"}</span>}
      </section>

      <section className="detail-section">
        <span className="section-label">COLOR PALETTE</span>
        <div className="palette-panel">
          {(style.colors ?? []).map((color) => (
            <article className="color-tile" key={`${color.role}-${color.hex}`}>
              <span style={{ background: color.hex }} />
              <strong>{color.hex}</strong>
              <small>{roleName(color.role)} · {color.proportion}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <span className="section-label">STYLE SYSTEM · NO TYPOGRAPHY</span>
        <div className="style-system-panel">
          <div className="keyword-row">
            {(style.keywords ?? []).slice(0, 5).map((keyword) => (
              <span key={keyword.word}>{keyword.word}</span>
            ))}
          </div>
          <div className="visual-rule-grid">
            <VisualRuleCard label="GRID" value={style.layout?.grid?.value} />
            <VisualRuleCard label="SPACE" value={style.layout?.whitespace?.value} />
            <VisualRuleCard label="RADIUS" value={style.shapes?.corners?.value} />
            <VisualRuleCard label="BORDER" value={style.shapes?.borders?.value} />
            <VisualRuleCard label="SHADOW" value={style.effects?.shadow?.value} />
            <VisualRuleCard label="TEXTURE" value={style.effects?.texture?.value} />
          </div>
        </div>
      </section>

      <section className="detail-section attachments">
        <span className="section-label">ATTACHMENTS</span>
        <button className="attachment-file" type="button" onClick={onOpenMd}>
          <span className="file-icon">▣</span>
          <div>
            <strong>{mdName}</strong>
            <small>{Math.ceil(style.markdown.length / 1024)} KB · Markdown Document</small>
          </div>
          <span className="open-label">OPEN</span>
        </button>
      </section>

      <div className="download-actions">
        <button type="button" onClick={() => downloadText(mdName, style.markdown, "text/markdown;charset=utf-8")}>
          ▣ Download MD
        </button>
        <button
          type="button"
          onClick={() => downloadText(
            paletteName,
            JSON.stringify(style.colors ?? [], null, 2),
            "application/json;charset=utf-8"
          )}
        >
          ◌ Download Palette
        </button>
      </div>
    </div>
  );
}

function VisualRuleCard({ label, value }: { label: string; value?: string }) {
  return (
    <article className="visual-rule-card">
      <strong>{label}</strong>
      <p>{value || "未识别"}</p>
    </article>
  );
}

function MarkdownScreen({ style, onBack }: { style: StyleResult; onBack: () => void }) {
  const mdName = `${style.name || "styleslice"}_spec.md`.replace(/[\\/:*?"<>|]/g, "_");

  return (
    <div className="screen markdown-screen">
      <button className="back-link" type="button" onClick={onBack}>← BACK TO DETAIL</button>
      <header className="markdown-header">
        <span>Markdown</span>
        <h1>{style.name}</h1>
        <p>{mdName}</p>
      </header>
      <article className="markdown-sheet">
        <pre>{style.markdown}</pre>
      </article>
      <button
        className="md-floating-download"
        type="button"
        onClick={() => downloadText(mdName, style.markdown, "text/markdown;charset=utf-8")}
      >
        Download MD
      </button>
    </div>
  );
}
