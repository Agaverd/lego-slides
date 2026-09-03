"use client";

import { ChangeEvent, CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, NumberInput, TextInput, ThemeProvider, configure } from "@gravity-ui/uikit";
import { ArrowRotateLeft, ArrowRotateRight, ChevronDown, Copy, Eye, EyeSlash, FileArrowDown, Plus, TrashBin } from "@gravity-ui/icons";
import { Block, BlockType, GridArea, PresentationSettings, Project, Slide, createBlankProject, createBlock, createDemoProject, defaultPresentationSettings, getMetricVariant, presets } from "../domain";
import { LocalProjectRepository } from "../repository";
import { requestGoogleDriveToken } from "../export/google";
import { downloadPptx, uploadToGoogleSlides } from "../export/pptx";

const repo = new LocalProjectRepository();
configure({ lang: "ru" });
const clone = <T,>(value: T): T => structuredClone(value);
const hydrateProject = (saved: Project) => {
  const savedGrid = saved.presentationSettings?.grid;
  return { ...saved, presentationSettings: { ...defaultPresentationSettings, ...saved.presentationSettings, padding: { ...defaultPresentationSettings.padding, ...saved.presentationSettings?.padding }, grid: { ...defaultPresentationSettings.grid, ...savedGrid, gap: savedGrid?.gap === 8 ? 2 : savedGrid?.gap ?? 2 } } };
};
const overlaps = (a: GridArea, b: GridArea) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const canPlace = (area: GridArea, blocks: Block[], columns: number, rows: number, ignoreId?: string) => area.x >= 0 && area.y >= 0 && area.x + area.w <= columns && area.y + area.h <= rows && !blocks.some((b) => b.id !== ignoreId && overlaps(area, b.grid));

function findSpace(blocks: Block[], width: number, height: number, columns: number, rows: number) {
  for (let y = 0; y <= rows - height; y++) for (let x = 0; x <= columns - width; x++) {
    const area = { x, y, w: width, h: height };
    if (canPlace(area, blocks, columns, rows)) return area;
  }
  return null;
}

function findBestSpace(blocks: Block[], width: number, height: number, columns: number, rows: number, origin?: { x: number; y: number }) {
  const sizes = Array.from({ length: Math.min(width, columns) }, (_, wi) => Math.min(width, columns) - wi)
    .flatMap((w) => Array.from({ length: Math.min(height, rows) }, (_, hi) => ({ w, h: Math.min(height, rows) - hi })))
    .sort((a, b) => b.w * b.h - a.w * a.h || b.w - a.w);
  if (origin) {
    for (const size of sizes) {
      const area = { x: Math.max(0, Math.min(columns - size.w, origin.x)), y: Math.max(0, Math.min(rows - size.h, origin.y)), ...size };
      if (canPlace(area, blocks, columns, rows)) return area;
    }
  }
  for (const size of sizes) {
    const area = findSpace(blocks, size.w, size.h, columns, rows);
    if (area) return area;
  }
  return null;
}

function resolveWidgetMove(blocks: Block[], movingId: string, target: GridArea, columns: number, rows: number) {
  const colliders = blocks.filter((block) => block.id !== movingId && overlaps(target, block.grid));
  if (!colliders.length) return {} as Record<string, GridArea>;
  const fixed = blocks.filter((block) => block.id !== movingId && !colliders.some((candidate) => candidate.id === block.id));
  const placed: Block[] = [...fixed, { id: "__reserved__", type: "text", grid: target, content: {} }];
  const resolved: Record<string, GridArea> = {};
  for (const block of colliders) {
    const candidates: GridArea[] = [];
    for (let y = 0; y <= rows - block.grid.h; y++) for (let x = 0; x <= columns - block.grid.w; x++) candidates.push({ x, y, w: block.grid.w, h: block.grid.h });
    candidates.sort((a, b) => {
      const distanceA = Math.abs(a.x - block.grid.x) + Math.abs(a.y - block.grid.y);
      const distanceB = Math.abs(b.x - block.grid.x) + Math.abs(b.y - block.grid.y);
      if (distanceA !== distanceB) return distanceA - distanceB;
      const pushA = Math.abs(a.x + a.w / 2 - (target.x + target.w / 2)) + Math.abs(a.y + a.h / 2 - (target.y + target.h / 2));
      const pushB = Math.abs(b.x + b.w / 2 - (target.x + target.w / 2)) + Math.abs(b.y + b.h / 2 - (target.y + target.h / 2));
      return pushB - pushA;
    });
    const next = candidates.find((area) => canPlace(area, placed, columns, rows));
    if (!next) return null;
    resolved[block.id] = next;
    placed.push({ ...block, grid: next });
  }
  return resolved;
}

function BlockContent({ block, editing, onContent }: { block: Block; editing: boolean; onContent: (content: Record<string, unknown>) => void }) {
  const c = block.content;
  if (block.type === "metric") {
    const variant = getMetricVariant(block.grid); const compact = block.grid.w <= 2 || block.grid.h <= 2;
    return <div className={`metric metric-${variant} ${compact ? "metric-compact" : ""}`}><div className="metric-primary"><strong>{String(c.value)}</strong>{variant !== "square" && <div className="metric-label">{String(c.label)}</div>}</div>{variant !== "square" && !compact && <small>{String(c.comparison)}</small>}{variant !== "square" && block.grid.w * block.grid.h >= 24 && <p>{String(c.detail)}</p>}</div>;
  }
  if (block.type === "text") return <RichTextBlock block={block} editing={editing} onContent={onContent} />;
  if (block.type === "divider") return String(c.variant) === "line" ? <div className="divider-line" /> : <div className="divider-label">{String(c.label)}</div>;
  if (block.type === "image") return c.src ? <img className="block-image" src={String(c.src)} alt={String(c.alt ?? "")} style={{ objectFit: c.fit as "cover" | "contain", objectPosition: `center ${String(c.align ?? "center")}` }} /> : <EmptyMedia label="Добавьте изображение" />; // eslint-disable-line @next/next/no-img-element -- local data URLs are user content
  if (block.type === "mockup") return <Mockup block={block} />;
  if (block.type === "table") return <TableBlock block={block} editing={editing} onContent={onContent} />;
  const points = c.points as Array<{ label: string; value: number }>;
  const max = Math.max(...points.map((p) => p.value), 1);
  return <div className={`chart chart-${String(c.chartType).toLowerCase()}`}>{points.map((p) => <div className="chart-item" key={p.label}><span>{p.value}</span><div style={{ height: `${Math.max(8, p.value / max * 72)}%` }} /><small>{p.label}</small></div>)}</div>;
}

function resizeTable(rows: string[][], rowCount: number, columnCount: number) {
  return Array.from({ length: rowCount }, (_, rowIndex) => Array.from({ length: columnCount }, (_, columnIndex) => rows[rowIndex]?.[columnIndex] ?? ""));
}

function TableBlock({ block, editing, onContent }: { block: Block; editing: boolean; onContent: (content: Record<string, unknown>) => void }) {
  const c = block.content; const rows = (c.rows as string[][]) ?? [[""]];
  const updateCell = (rowIndex: number, columnIndex: number, value: string) => { const next = clone(rows); next[rowIndex][columnIndex] = value; onContent({ ...c, rows: next }); };
  const addRow = () => onContent({ ...c, rows: [...rows, Array(rows[0]?.length || 2).fill("")].slice(0, 30) });
  return <div className={`table-wrap ${editing ? "is-editing" : ""}`}>
    <table><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex} contentEditable={editing} suppressContentEditableWarning onBlur={(event) => updateCell(rowIndex, columnIndex, event.currentTarget.innerText)}>{cell}</td>)}</tr>)}</tbody></table>
    {editing && <button className="table-edge-add-row" type="button" aria-label="Добавить строку" title="Добавить строку" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={addRow}><Icon data={Plus} size={14} /><span>Строка</span></button>}
  </div>;
}

function textToHtml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>");
}

function RichTextBlock({ block, editing, onContent }: { block: Block; editing: boolean; onContent: (content: Record<string, unknown>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const c = block.content;
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const fontFamily = String(c.fontFamily ?? "Inter") === "Unbounded" ? '"Unbounded", sans-serif' : 'Inter, Arial, sans-serif';
  const fontSize = Number(c.fontSize); const style: CSSProperties = { color: String(c.textColor ?? "#000000"), background: c.backgroundEnabled ? String(c.backgroundColor ?? "#FFFFFF") : undefined, fontFamily, ...(Number.isFinite(fontSize) ? { fontSize: `${fontSize}px` } : {}) };
  return <div ref={ref} style={style} className={`text-block text-${String(c.variant)} ${editing ? "is-rich-editing" : ""}`} contentEditable={editing} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: String(c.html ?? textToHtml(String(c.text))) }} onBlur={(e) => onContent({ ...c, text: e.currentTarget.innerText, html: e.currentTarget.innerHTML })} />;
}

function RichTextToolbar() {
  const command = (name: string) => () => document.execCommand(name);
  return <div className="rich-text-toolbar" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}>
    <button type="button" aria-label="Полужирный" onClick={command("bold")}><strong>B</strong></button>
    <button type="button" aria-label="Курсив" onClick={command("italic")}><em>I</em></button>
    <button type="button" aria-label="Подчёркивание" onClick={command("underline")}><u>U</u></button>
    <span className="rich-text-divider" />
    <button type="button" aria-label="Маркированный список" onClick={command("insertUnorderedList")}>•≡</button>
    <button type="button" aria-label="Нумерованный список" onClick={command("insertOrderedList")}>1≡</button>
    <span className="rich-text-divider" />
    <button type="button" aria-label="По левому краю" onClick={command("justifyLeft")}>≡</button>
    <button type="button" aria-label="По центру" onClick={command("justifyCenter")}>≣</button>
    <button type="button" aria-label="По правому краю" onClick={command("justifyRight")}>≡</button>
  </div>;
}

function BrandLogo() {
  // eslint-disable-next-line @next/next/no-img-element -- bundled brand asset
  return <img className="brand-logo" src="/logo.png" alt="Lego Slides" />;
}

function EmptyMedia({ label }: { label: string }) { return <div className="empty-media"><span>▧</span>{label}</div>; }

const deviceFrames = {
  "iPhone 17": {
    colors: { White: "/device-frames/iphone-17-white.png", Black: "/device-frames/iphone-17-black.png", Pink: "/device-frames/iphone-17-pink.png" },
    screen: { left: "4.2%", top: "1.6%", width: "91.6%", height: "96.4%", borderRadius: "13% / 6%" },
  },
  Android: {
    colors: { White: "/device-frames/android-white.png", Black: "/device-frames/android-black.png" },
    screen: { left: "4.1%", top: "1.7%", width: "91.7%", height: "96.5%", borderRadius: "12% / 5.5%" },
  },
  "MacBook Air": {
    colors: { Silver: "/device-frames/macbook-air-silver.png" },
    screen: { left: "10.1%", top: "3.4%", width: "79.8%", height: "85.4%", borderRadius: "1.5%" },
  },
} as const;

type DeviceModel = keyof typeof deviceFrames;

const backgroundPresets: Record<string, string> = {
  "wb-blue": "linear-gradient(118deg, #BCEBFF 0%, #DFF5FF 32%, #F7FBFF 72%, #FFFFFF 100%)",
  "wb-violet": "radial-gradient(circle at 16% 18%, #D7C9FF 0 14%, transparent 38%), radial-gradient(circle at 86% 78%, #B9ECFF 0 16%, transparent 42%), #F8F9FF",
  "wb-warm": "radial-gradient(circle at 18% 76%, #FFE4C2 0 15%, transparent 42%), radial-gradient(circle at 84% 20%, #F2D9FF 0 14%, transparent 38%), #FFFDF9",
  "soft-blue": "linear-gradient(135deg, #cfe8ff 0%, #d8f3e7 52%, #fbf6df 100%)",
  "night": "radial-gradient(circle at 30% 25%, #2c405e 0%, #10141d 48%, #07090d 100%)",
  "paper": "linear-gradient(135deg, #f4f1ea, #d7d3ca)",
  "sunset": "linear-gradient(145deg, #f6ae72, #d96f82 46%, #5f5aa8)",
  "forest": "linear-gradient(145deg, #b8d6b0, #4d8065 48%, #173e37)",
  "mesh": "radial-gradient(circle at 18% 22%, #81d4fa 0 18%, transparent 42%), radial-gradient(circle at 78% 28%, #c6ffdd 0 16%, transparent 40%), radial-gradient(circle at 52% 82%, #f8b4d9 0 20%, transparent 48%), #e7e8ff",
};

function Mockup({ block }: { block: Block }) {
  const c = block.content; const src = String(c.src ?? "");
  const model = (String(c.deviceModel ?? "iPhone 17") in deviceFrames ? String(c.deviceModel ?? "iPhone 17") : "iPhone 17") as DeviceModel;
  const frame = deviceFrames[model]; const availableColors = Object.keys(frame.colors); const color = availableColors.includes(String(c.deviceColor)) ? String(c.deviceColor) : availableColors[0];
  const frameSrc = (frame.colors as Record<string, string>)[color]; const screenStyle = frame.screen;
  const backgroundMode = String(c.backgroundMode ?? "Image"); const backgroundStyle = String(c.backgroundStyle ?? "Mesh"); const preset = String(c.backgroundPreset ?? "mesh"); const backgroundImage = String(c.backgroundImage ?? "");
  const stageStyle: CSSProperties = backgroundMode === "None" ? { background: "transparent" } : backgroundStyle === "Solid" ? { background: String(c.background ?? "#1C1C1C") } : backgroundImage ? { backgroundImage: `url(${JSON.stringify(backgroundImage)})`, backgroundPosition: "center", backgroundSize: "cover" } : { background: backgroundPresets[preset] ?? backgroundPresets.mesh };
  return <div className={`mockup-device-stage ${backgroundMode === "None" ? "is-transparent" : ""}`} style={stageStyle}>
    <div className={`device-composite ${model === "MacBook Air" ? "is-laptop" : "is-phone"}`} style={{ transform: `translate(${Number(c.horizontal ?? 0)}px, ${Number(c.vertical ?? 0)}px) scale(${Number(c.scale ?? 90) / 100})` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local user image */}
      <div className="device-screen" style={screenStyle}>{src ? <img src={src} alt="Скриншот продукта" style={{ objectFit: c.fit as "cover" | "contain" }} /> : <div className="product-skeleton"><i /><i /><i /><b /></div>}</div>
      {/* eslint-disable-next-line @next/next/no-img-element -- bundled transparent device frame */}
      <img className="device-frame-image" src={frameSrc} alt={`${model}, ${color}`} />
    </div>
  </div>;
}

type ResizeEdge = "left" | "right" | "top" | "bottom";
type FloatingArea = { x: number; y: number; w: number; h: number };

function getGridMetrics(settings: PresentationSettings) {
  const { columns, rows, gap } = settings.grid;
  const availableW = 1200 - settings.padding.left - settings.padding.right; const availableH = 675 - settings.padding.top - settings.padding.bottom;
  const adaptiveW = (availableW - gap * (columns - 1)) / columns; const adaptiveH = (availableH - gap * (rows - 1)) / rows;
  const cellW = settings.grid.cellRatio === "square" ? Math.min(adaptiveW, adaptiveH) : adaptiveW; const cellH = settings.grid.cellRatio === "square" ? cellW : adaptiveH;
  const gridW = cellW * columns + gap * (columns - 1); const gridH = cellH * rows + gap * (rows - 1);
  return { left: settings.padding.left + (availableW - gridW) / 2, top: settings.padding.top + (availableH - gridH) / 2, cellW, cellH, gap, gridW, gridH };
}

function getBlockStyle(area: FloatingArea, settings: PresentationSettings) {
  const metrics = getGridMetrics(settings);
  return {
    left: `${(metrics.left + area.x * (metrics.cellW + metrics.gap)) / 12}%`, top: `${(metrics.top + area.y * (metrics.cellH + metrics.gap)) / 6.75}%`,
    width: `${(area.w * metrics.cellW + (area.w - 1) * metrics.gap) / 12}%`, height: `${(area.h * metrics.cellH + (area.h - 1) * metrics.gap) / 6.75}%`,
    "--block-radius": `${settings.blockRadius}px`, "--edge-zone-x": `${100 / Math.max(area.w, 1)}%`, "--edge-zone-y": `${100 / Math.max(area.h, 1)}%`,
  } as CSSProperties;
}

function getSlideStyle(slide: Slide, settings: PresentationSettings) {
  const style = slide.backgroundStyle ?? "Solid"; const image = slide.backgroundImage ?? ""; const preset = slide.backgroundPreset ?? "wb-blue";
  if (style === "Solid") return { background: slide.background || settings.slideColor };
  if (image) return { backgroundImage: `url(${JSON.stringify(image)})`, backgroundPosition: "center", backgroundSize: "cover" };
  return { background: backgroundPresets[preset] ?? backgroundPresets["wb-blue"] };
}

const magnetic = (value: number) => {
  const target = Math.round(value); const distance = Math.abs(value - target); const radius = 0.24;
  if (distance >= radius) return value;
  const t = 1 - distance / radius; const eased = t * t * (3 - 2 * t);
  return value + (target - value) * eased;
};

/* eslint-disable react-hooks/refs -- canvasRef is read only after a pointer or drop event starts, never during render */
function SlideCanvas({ slide, settings, selectedId, editingId, preview, showGrid = false, externalDragType, onSelect, onEdit, onMoveResize, onResolveMove, onDuplicateAt, onContent, onDropBlock }: {
  slide: Slide; settings: PresentationSettings; selectedId: string | null; editingId: string | null; preview: boolean; showGrid?: boolean;
  externalDragType?: BlockType | null; onSelect: (id: string | null) => void; onEdit: (id: string | null) => void; onMoveResize: (id: string, area: GridArea) => void; onResolveMove?: (id: string, area: GridArea, resolved: Record<string, GridArea>) => void; onDuplicateAt?: (id: string, area: GridArea) => void; onContent: (id: string, content: Record<string, unknown>) => void; onDropBlock?: (type: BlockType, origin: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<{ id: string; area: FloatingArea; mode: "move" | "resize" } | null>(null);
  const [guide, setGuide] = useState<{ area: FloatingArea; mode: "move" | "resize"; copy?: boolean } | null>(null);
  const [yieldingIds, setYieldingIds] = useState<string[]>([]);
  const [resolvedAreas, setResolvedAreas] = useState<Record<string, GridArea>>({});
  const startPointer = (e: ReactPointerEvent, block: Block, mode: "move" | ResizeEdge) => {
    if (preview || editingId === block.id) return;
    e.stopPropagation(); e.preventDefault(); onSelect(block.id);
    const canvas = canvasRef.current; if (!canvas) return;
    const start = { x: e.clientX, y: e.clientY, grid: { ...block.grid } };
    const rect = canvas.getBoundingClientRect(); const metrics = getGridMetrics(settings);
    const pitchX = (metrics.cellW + metrics.gap) * rect.width / 1200; const pitchY = (metrics.cellH + metrics.gap) * rect.height / 675;
    let live: FloatingArea = { ...start.grid }; let stepped: GridArea = { ...start.grid }; let dwellKey = ""; let dwellTimer = 0; let copyMode = e.altKey; let activeResolution: Record<string, GridArea> | null = null;
    const move = (event: PointerEvent) => {
      copyMode = event.altKey;
      const dx = (event.clientX - start.x) / pitchX; const dy = (event.clientY - start.y) / pitchY;
      let next: FloatingArea = { ...start.grid };
      if (mode === "move") next = { ...next, x: start.grid.x + dx, y: start.grid.y + dy };
      if (mode === "right") next.w = start.grid.w + dx;
      if (mode === "bottom") next.h = start.grid.h + dy;
      if (mode === "left") next = { ...next, x: start.grid.x + dx, w: start.grid.w - dx };
      if (mode === "top") next = { ...next, y: start.grid.y + dy, h: start.grid.h - dy };
      if (mode === "move") {
        next.x = Math.max(0, Math.min(settings.grid.columns - next.w, magnetic(next.x))); next.y = Math.max(0, Math.min(settings.grid.rows - next.h, magnetic(next.y)));
        live = next; setInteraction({ id: block.id, area: next, mode: "move" });
        const target = { x: Math.round(next.x), y: Math.round(next.y), w: start.grid.w, h: start.grid.h }; setGuide({ area: target, mode: "move", copy: copyMode });
        const colliders = slide.blocks.filter((candidate) => candidate.id !== block.id && overlaps(target, candidate.grid)).map((candidate) => candidate.id);
        const key = `${target.x}:${target.y}:${colliders.join(",")}`;
        if (colliders.length && !copyMode && key !== dwellKey) {
          window.clearTimeout(dwellTimer); dwellKey = key; activeResolution = null; setYieldingIds(colliders); setResolvedAreas({});
          dwellTimer = window.setTimeout(() => { const resolved = resolveWidgetMove(slide.blocks, block.id, target, settings.grid.columns, settings.grid.rows); if (resolved) { activeResolution = resolved; setResolvedAreas(resolved); setYieldingIds(Object.keys(resolved)); } }, 1200);
        }
        if (!colliders.length || copyMode) { window.clearTimeout(dwellTimer); dwellKey = ""; activeResolution = null; setYieldingIds([]); setResolvedAreas({}); }
        return;
      }
      if (mode === "right") next.w = Math.max(1, Math.min(settings.grid.columns - next.x, next.w));
      if (mode === "bottom") next.h = Math.max(1, Math.min(settings.grid.rows - next.y, next.h));
      if (mode === "left") { const right = start.grid.x + start.grid.w; next.x = Math.max(0, Math.min(right - 1, next.x)); next.w = right - next.x; }
      if (mode === "top") { const bottom = start.grid.y + start.grid.h; next.y = Math.max(0, Math.min(bottom - 1, next.y)); next.h = bottom - next.y; }
      live = next; setGuide({ area: next, mode: "resize" });
      const stepX = dx >= 0 ? Math.floor(dx) : Math.ceil(dx); const stepY = dy >= 0 ? Math.floor(dy) : Math.ceil(dy);
      let candidate: GridArea = { ...start.grid };
      if (mode === "right") candidate.w = start.grid.w + stepX;
      if (mode === "bottom") candidate.h = start.grid.h + stepY;
      if (mode === "left") candidate = { ...candidate, x: start.grid.x + stepX, w: start.grid.w - stepX };
      if (mode === "top") candidate = { ...candidate, y: start.grid.y + stepY, h: start.grid.h - stepY };
      if (candidate.w >= 1 && candidate.h >= 1 && canPlace(candidate, slide.blocks, settings.grid.columns, settings.grid.rows, block.id)) stepped = candidate;
      setInteraction({ id: block.id, area: stepped, mode: "resize" });
    };
    const up = (event: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.clearTimeout(dwellTimer);
      const snapped = mode === "move" ? { x: Math.round(live.x), y: Math.round(live.y), w: start.grid.w, h: start.grid.h } : stepped;
      const wantsCopy = mode === "move" && (event.altKey || copyMode) && (snapped.x !== start.grid.x || snapped.y !== start.grid.y);
      const validCopy = wantsCopy && canPlace(snapped, slide.blocks, settings.grid.columns, settings.grid.rows);
      const validDirect = canPlace(snapped, slide.blocks, settings.grid.columns, settings.grid.rows, block.id); const finalArea = validDirect || activeResolution ? snapped : start.grid;
      if (wantsCopy) {
        setInteraction({ id: block.id, area: start.grid, mode: "move" });
        if (validCopy && onDuplicateAt) onDuplicateAt(block.id, snapped);
      } else if (mode === "move" && activeResolution && onResolveMove) { setInteraction({ id: block.id, area: finalArea, mode: "move" }); onResolveMove(block.id, finalArea, activeResolution); }
      else { setInteraction({ id: block.id, area: finalArea, mode: mode === "move" ? "move" : "resize" }); onMoveResize(block.id, finalArea); }
      setGuide(null); setYieldingIds([]); setResolvedAreas({});
      window.setTimeout(() => setInteraction(null), 140);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const dragOrigin = (e: ReactDragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect(); const metrics = getGridMetrics(settings);
    const designX = (e.clientX - rect.left) / rect.width * 1200; const designY = (e.clientY - rect.top) / rect.height * 675;
    return { x: Math.max(0, Math.min(settings.grid.columns - 2, Math.round((designX - metrics.left) / (metrics.cellW + metrics.gap)))), y: Math.max(0, Math.min(settings.grid.rows - 2, Math.round((designY - metrics.top) / (metrics.cellH + metrics.gap)))) };
  };
  const dropBlock = (e: ReactDragEvent<HTMLDivElement>) => {
    const type = e.dataTransfer.getData("application/x-demo-block") as BlockType;
    if (!onDropBlock || !["text", "metric", "mockup", "image", "table", "chart", "divider"].includes(type)) return;
    e.preventDefault(); const origin = dragOrigin(e); setGuide(null); onDropBlock(type, origin);
  };
  const metrics = getGridMetrics(settings); const canvasStyle = { ...getSlideStyle(slide, settings), "--grid-columns": settings.grid.columns, "--grid-rows": settings.grid.rows } as unknown as CSSProperties;
  const gridStyle = { left: `${metrics.left / 12}%`, top: `${metrics.top / 6.75}%`, width: `${metrics.gridW / 12}%`, height: `${metrics.gridH / 6.75}%`, columnGap: `${metrics.gap / metrics.gridW * 100}%`, rowGap: `${metrics.gap / metrics.gridH * 100}%` };
  return <div ref={canvasRef} className={`slide-canvas ${preview ? "is-preview" : ""}`} style={canvasStyle} onPointerDown={() => onSelect(null)} onDragOver={(e) => { if (onDropBlock) { e.preventDefault(); if (externalDragType) setGuide({ area: { ...dragOrigin(e), w: 2, h: 2 }, mode: "move" }); } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setGuide(null); }} onDrop={dropBlock} role="presentation">
    {showGrid && <div className="grid-cells" style={gridStyle}>{Array.from({ length: settings.grid.columns * settings.grid.rows }, (_, index) => <i key={index} />)}</div>}
    {guide && <div className={`interaction-guide guide-${guide.mode} ${guide.copy ? "is-copy" : ""}`} style={getBlockStyle(guide.area, settings)}>{guide.copy && <span>Alt · копия</span>}</div>}
    {slide.blocks.length === 0 && <div className="empty-slide"><strong>Пустой слайд</strong><span>Добавьте первый блок</span></div>}
    {slide.blocks.map((block) => <div key={block.id} className={`slide-block block-${block.type} ${selectedId === block.id ? "is-selected" : ""} ${interaction?.id === block.id ? "is-interacting" : ""} ${yieldingIds.includes(block.id) ? "is-yielding" : ""}`} style={getBlockStyle(interaction?.id === block.id ? interaction.area : resolvedAreas[block.id] ?? block.grid, settings)} onPointerDown={(e) => startPointer(e, block, "move")} onDoubleClick={(e) => { e.stopPropagation(); onSelect(block.id); if (block.type === "text" || block.type === "table") onEdit(block.id); }}>
      {editingId === block.id && block.type === "text" && <RichTextToolbar />}
      <div className="block-inner"><BlockContent block={interaction?.id === block.id ? { ...block, grid: { x: Math.round(interaction.area.x), y: Math.round(interaction.area.y), w: Math.max(1, Math.round(interaction.area.w)), h: Math.max(1, Math.round(interaction.area.h)) } } : block} editing={editingId === block.id} onContent={(content) => onContent(block.id, content)} /></div>
      {!preview && selectedId === block.id && (["top", "right", "bottom", "left"] as ResizeEdge[]).map((edge) => <button key={edge} className={`edge-resize edge-resize-${edge}`} aria-label={`Изменить размер: ${edge}`} onPointerDown={(e) => startPointer(e, block, edge)}><span /></button>)}
    </div>)}
    {settings.showSlideNumbers && <span className="canvas-slide-number">{String(slide.order + 1).padStart(2, "0")}</span>}
  </div>;
}
/* eslint-enable react-hooks/refs */

function SlideThumbnail({ slide, settings }: { slide: Slide; settings: PresentationSettings }) {
  const ref = useRef<HTMLDivElement>(null); const [scale, setScale] = useState(0.16);
  useEffect(() => {
    const element = ref.current; if (!element) return;
    const update = () => setScale(element.clientWidth / 1080); update();
    const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="thumbnail"><div className="thumbnail-scale" style={{ transform: `scale(${scale})` }}><SlideCanvas slide={slide} settings={settings} selectedId={null} editingId={null} preview onSelect={() => {}} onEdit={() => {}} onMoveResize={() => {}} onContent={() => {}} /></div></div>;
}

const blockLabels: Record<BlockType, { icon: string; label: string }> = {
  text: { icon: "T", label: "Текст" }, metric: { icon: "%", label: "Метрика" }, mockup: { icon: "▣", label: "Мокап" }, image: { icon: "▧", label: "Изображение" }, table: { icon: "▦", label: "Таблица" }, chart: { icon: "▥", label: "График" }, divider: { icon: "—", label: "Разделитель" },
};

function BlockDock({ onAdd, onDragType }: { onAdd: (type: BlockType) => void; onDragType: (type: BlockType | null) => void }) {
  const [dragging, setDragging] = useState<BlockType | null>(null); const [returning, setReturning] = useState<BlockType | null>(null); const detachTimer = useRef<number>(0); const returnTimer = useRef<number>(0);
  useEffect(() => () => { window.clearTimeout(detachTimer.current); window.clearTimeout(returnTimer.current); }, []);
  return <div className="block-dock" aria-label="Добавить блок">{(Object.keys(blockLabels) as BlockType[]).map((type) => <button key={type} type="button" draggable className={`${dragging === type ? "is-dragging" : ""} ${returning === type ? "is-returning" : ""}`} title={blockLabels[type].label} aria-label={`Добавить: ${blockLabels[type].label}`} onClick={() => onAdd(type)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-demo-block", type); onDragType(type); window.clearTimeout(detachTimer.current); detachTimer.current = window.setTimeout(() => setDragging(type), 90); }} onDragEnd={() => { window.clearTimeout(detachTimer.current); window.clearTimeout(returnTimer.current); setDragging(null); onDragType(null); setReturning(type); returnTimer.current = window.setTimeout(() => setReturning(null), 620); }}><span>{blockLabels[type].icon}</span><small>{blockLabels[type].label}</small></button>)}</div>;
}

function PresentationGallery({ projects, onOpen, onCreate }: { projects: Project[]; onOpen: (project: Project) => void; onCreate: () => void }) {
  return <ThemeProvider theme="dark"><main className="gallery-shell">
    <header className="gallery-topbar"><div className="brand"><BrandLogo /><strong>Lego Slides</strong></div></header>
    <section className="gallery-create-section"><div className="gallery-section-inner"><h1>Создать презентацию</h1><button className="blank-presentation-card" type="button" onClick={onCreate}><span className="blank-presentation-preview"><Icon data={Plus} size={36} /></span><strong>Пустая презентация</strong></button></div></section>
    <section className="gallery-content"><h2>Недавние презентации</h2>
      <div className="project-gallery">{projects.map((item) => <button type="button" className="project-card" key={item.id} onClick={() => onOpen(item)}>
        <div className="project-card-preview">{item.slides[0] ? <SlideThumbnail slide={item.slides[0]} settings={item.presentationSettings} /> : <span>Пустая презентация</span>}<i>Открыть</i></div>
        <div className="project-card-copy"><strong>{item.title || "Без названия"}</strong><span>{item.slides.length} {item.slides.length === 1 ? "слайд" : "слайдов"}</span><time dateTime={item.updatedAt}>Изменено {new Date(item.updatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}</time></div>
      </button>)}</div>
      {!projects.length && <p className="gallery-empty-note">Здесь появятся созданные презентации.</p>}
    </section>
  </main></ThemeProvider>;
}

export function DemoSlidesEditor() {
  const [project, setProject] = useState<Project>(() => createDemoProject());
  const [projects, setProjects] = useState<Project[]>([]); const [view, setView] = useState<"gallery" | "editor">("gallery");
  const [currentId, setCurrentId] = useState(""); const [selectedId, setSelectedId] = useState<string | null>(null); const [editingId, setEditingId] = useState<string | null>(null);
  const [gridVisible, setGridVisible] = useState(true); const [presetOpen, setPresetOpen] = useState(false); const [notice, setNotice] = useState(""); const [ready, setReady] = useState(false);
  const [past, setPast] = useState<Project[]>([]); const [future, setFuture] = useState<Project[]>([]); const [dragSlideId, setDragSlideId] = useState<string | null>(null); const [dockDragType, setDockDragType] = useState<BlockType | null>(null);
  const [exportOpen, setExportOpen] = useState(false); const [exportBusy, setExportBusy] = useState(false); const [googleSlidesUrl, setGoogleSlidesUrl] = useState("");

  useEffect(() => { repo.listProjects().then((saved) => { const items = saved.map(hydrateProject); setProjects(items); if (items[0]) { setProject(items[0]); setCurrentId(items[0].slides[0]?.id ?? ""); } setReady(true); }); }, []);
  useEffect(() => { if (!ready || view !== "editor") return; const timer = setTimeout(() => { const saved = { ...project, updatedAt: new Date().toISOString() }; repo.saveProject(saved).then(() => { setProjects((items) => [saved, ...items.filter((item) => item.id !== saved.id)]); setNotice("Сохранено"); }).catch(() => setNotice("Не удалось сохранить: хранилище браузера заполнено")); }, 350); return () => clearTimeout(timer); }, [project, ready, view]);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(""), 1400); return () => clearTimeout(t); } }, [notice]);

  const current = project.slides.find((s) => s.id === currentId) ?? project.slides[0];
  const selected = current?.blocks.find((b) => b.id === selectedId) ?? null;
  const commit = useCallback((next: Project | ((p: Project) => Project)) => { setProject((p) => { const value = typeof next === "function" ? next(p) : next; setPast((h) => [...h.slice(-49), clone(p)]); setFuture([]); return value; }); }, []);
  const updateCurrent = useCallback((fn: (s: Slide) => Slide) => commit((p) => ({ ...p, slides: p.slides.map((s) => s.id === currentId ? fn(s) : s) })), [commit, currentId]);
  const undo = useCallback(() => { setPast((h) => { const previous = h.at(-1); if (!previous) return h; setFuture((f) => [clone(project), ...f]); setProject(previous); return h.slice(0, -1); }); }, [project]);
  const redo = useCallback(() => { setFuture((f) => { const next = f[0]; if (!next) return f; setPast((h) => [...h, clone(project)]); setProject(next); return f.slice(1); }); }, [project]);

  const removeSelected = useCallback(() => { if (!selectedId) return; updateCurrent((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== selectedId) })); setSelectedId(null); }, [selectedId, updateCurrent]);
  const duplicateBlock = useCallback(() => { if (!selected || !current) return; const { columns, rows } = project.presentationSettings.grid; const area = findBestSpace(current.blocks, selected.grid.w, selected.grid.h, columns, rows, { x: selected.grid.x + 1, y: selected.grid.y + 1 }); if (!area) { setNotice("На слайде нет места для копии"); return; } const copy = { ...clone(selected), id: crypto.randomUUID(), grid: area }; updateCurrent((s) => ({ ...s, blocks: [...s.blocks, copy] })); setSelectedId(copy.id); setNotice(area.w < selected.grid.w || area.h < selected.grid.h ? "Копия уменьшена до свободного места" : "Блок продублирован"); }, [selected, current, project.presentationSettings.grid, updateCurrent]);
  const duplicateBlockAt = useCallback((id: string, area: GridArea) => { const copyId = crypto.randomUUID(); updateCurrent((s) => { const source = s.blocks.find((block) => block.id === id); if (!source) return s; return { ...s, blocks: [...s.blocks, { ...clone(source), id: copyId, grid: area }] }; }); setSelectedId(copyId); setNotice("Копия размещена на холсте"); }, [updateCurrent]);
  const patchSelectedContent = useCallback((patch: Record<string, unknown>) => { if (!selected) return; updateCurrent((s) => ({ ...s, blocks: s.blocks.map((b) => b.id === selected.id ? { ...b, content: { ...b.content, ...patch } } : b) })); }, [selected, updateCurrent]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const input = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable);
      if (e.key === "Escape") { setEditingId(null); setSelectedId(null); setPresetOpen(false); setExportOpen(false); }
      if (input) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) { e.preventDefault(); removeSelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateBlock(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [selectedId, removeSelected, duplicateBlock, undo, redo]);
  useEffect(() => {
    const paste = (e: ClipboardEvent) => { const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/")); if (!file || !selected || !["image", "mockup"].includes(selected.type)) return; const reader = new FileReader(); reader.onload = () => patchSelectedContent({ src: String(reader.result) }); reader.readAsDataURL(file); };
    window.addEventListener("paste", paste); return () => window.removeEventListener("paste", paste);
  }, [selected, patchSelectedContent]);
  const addBlock = (type: BlockType, origin?: { x: number; y: number }) => { if (!current) return; const block = createBlock(type, { x: origin?.x ?? 0, y: origin?.y ?? 0, w: 2, h: 2 }); const { columns, rows } = project.presentationSettings.grid; const area = findBestSpace(current.blocks, 2, 2, columns, rows, origin); if (!area) { setNotice("На слайде нет свободного места"); return; } block.grid = area; updateCurrent((s) => ({ ...s, blocks: [...s.blocks, block] })); setSelectedId(block.id); };
  const addSlide = (name: keyof typeof presets) => { const id = crypto.randomUUID(); const blocks = clone(presets[name]).map((b) => ({ ...createBlock((b.type ?? "text") as BlockType), ...b, id: crypto.randomUUID() })) as Block[]; const next: Slide = { id, order: project.slides.length, title: String(name), background: "#FFFFFF", backgroundMode: "Image", backgroundStyle: "Solid", backgroundPreset: "wb-blue", blocks }; commit((p) => ({ ...p, slides: [...p.slides, next] })); setCurrentId(id); setSelectedId(null); setPresetOpen(false); };
  const duplicateSlide = (id: string) => { const source = project.slides.find((s) => s.id === id); if (!source) return; const copy = { ...clone(source), id: crypto.randomUUID(), title: `${source.title} — копия`, blocks: source.blocks.map((b) => ({ ...b, id: crypto.randomUUID() })) }; commit((p) => ({ ...p, slides: [...p.slides, copy].map((s, i) => ({ ...s, order: i })) })); setCurrentId(copy.id); };
  const deleteSlide = (id: string) => { if (project.slides.length === 1) { setNotice("В презентации должен остаться один слайд"); return; } const left = project.slides.filter((s) => s.id !== id); commit({ ...project, slides: left.map((s, i) => ({ ...s, order: i })) }); if (currentId === id) setCurrentId(left[0].id); };
  const reorder = (targetId: string) => { if (!dragSlideId || dragSlideId === targetId) return; const list = [...project.slides]; const from = list.findIndex((s) => s.id === dragSlideId); const to = list.findIndex((s) => s.id === targetId); const [moved] = list.splice(from, 1); list.splice(to, 0, moved); commit({ ...project, slides: list.map((s, i) => ({ ...s, order: i })) }); setDragSlideId(null); };
  const upload = (e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => patchSelectedContent({ src: String(reader.result) }); reader.readAsDataURL(file); };
  const exportPowerPoint = async () => { setExportBusy(true); setExportOpen(false); try { await downloadPptx(project); setNotice("PPTX готов"); } catch { setNotice("Не удалось создать PPTX"); } finally { setExportBusy(false); } };
  const exportGoogleSlides = async () => { const clientId = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GOOGLE_CLIENT_ID; if (!clientId) { setNotice("Добавьте VITE_GOOGLE_CLIENT_ID для Google Slides"); return; } setExportBusy(true); setGoogleSlidesUrl(""); try { const token = await requestGoogleDriveToken(clientId); const result = await uploadToGoogleSlides(project, token); const url = result.webViewLink || `https://docs.google.com/presentation/d/${result.id}/edit`; setGoogleSlidesUrl(url); setExportOpen(true); setNotice("Презентация создана в Google Slides"); } catch (error) { setNotice(error instanceof Error ? error.message : "Экспорт Google Slides не выполнен"); } finally { setExportBusy(false); } };
  const updatePresentationSettings = (settings: PresentationSettings) => commit((p) => ({ ...p, presentationSettings: settings }));
  const openProject = (next: Project) => { const hydrated = hydrateProject(next); setProject(hydrated); setCurrentId(hydrated.slides[0]?.id ?? ""); setSelectedId(null); setEditingId(null); setPast([]); setFuture([]); setView("editor"); };
  const createProject = () => { const next = createBlankProject(); setProjects((items) => [next, ...items]); openProject(next); };
  const openGallery = async () => { const saved = { ...project, updatedAt: new Date().toISOString() }; try { await repo.saveProject(saved); setProjects((items) => [saved, ...items.filter((item) => item.id !== saved.id)]); } finally { setView("gallery"); setSelectedId(null); setEditingId(null); } };

  if (!ready) return <div className="app-loading"><span />Загружаем презентацию…</div>;
  if (view === "gallery") return <PresentationGallery projects={projects} onOpen={openProject} onCreate={createProject} />;
  if (!current) return <div className="app-loading"><span />Загружаем презентацию…</div>;
  return <ThemeProvider theme="dark"><main className="editor-shell">
    <header className="topbar"><div className="brand"><Button className="projects-back-button" view="flat" onClick={openGallery}>Все презентации</Button><BrandLogo /><TextInput aria-label="Название проекта" value={project.title} onUpdate={(title) => commit({ ...project, title })} size="m" /></div><div className="save-state">{notice || "Автосохранение включено"}</div><div className="top-actions"><Button view="flat" onClick={undo} disabled={!past.length} aria-label="Отменить"><Icon data={ArrowRotateLeft} size={16} /></Button><Button view="flat" onClick={redo} disabled={!future.length} aria-label="Повторить"><Icon data={ArrowRotateRight} size={16} /></Button><div className="export-control"><Button className="export-button" view="action" loading={exportBusy} onClick={() => setExportOpen((open) => !open)}><Icon data={FileArrowDown} size={16} />Экспорт<Icon data={ChevronDown} size={13} /></Button>{exportOpen && <div className="export-popover"><button type="button" onClick={exportPowerPoint}><span>P</span><div><strong>PowerPoint</strong><small>Скачать файл .pptx</small></div></button><button type="button" onClick={exportGoogleSlides}><span>G</span><div><strong>Google Slides</strong><small>Подключить Google и создать копию</small></div></button>{googleSlidesUrl && <a href={googleSlidesUrl} target="_blank" rel="noreferrer">Открыть созданную презентацию ↗</a>}</div>}</div></div></header>
    <div className="workspace">
      <aside className="slides-panel"><div className="panel-title"><span>Слайды</span><small>{project.slides.length}</small></div><div className="slide-list">{project.slides.map((s, i) => <div key={s.id} className={`thumbnail-row ${s.id === current.id ? "active" : ""}`} draggable tabIndex={0} role="button" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setCurrentId(s.id); setSelectedId(null); } }} onDragStart={() => setDragSlideId(s.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(s.id)} onClick={() => { setCurrentId(s.id); setSelectedId(null); }}><span className="slide-number">{String(i + 1).padStart(2, "0")}</span><SlideThumbnail slide={s} settings={project.presentationSettings} /><div className="thumb-actions"><Button view="flat" onClick={(e) => { e.stopPropagation(); duplicateSlide(s.id); }} title="Дублировать"><Icon data={Copy} size={14} /></Button><Button view="flat-danger" onClick={(e) => { e.stopPropagation(); deleteSlide(s.id); }} title="Удалить"><Icon data={TrashBin} size={14} /></Button></div></div>)}</div><div className="add-wrap"><Button className="add-slide-button" view="action" width="max" onClick={() => setPresetOpen(!presetOpen)}><Icon data={Plus} size={16} />Добавить слайд</Button>{presetOpen && <div className="popover presets"><strong>Выберите раскладку</strong>{Object.keys(presets).map((p) => <button key={p} onClick={() => addSlide(p as keyof typeof presets)}><span className="preset-icon" />{p}</button>)}</div>}</div></aside>
      <section className="canvas-area"><div className="canvas-toolbar"><span>Слайд {current.order + 1}</span><span>16:9 · {project.presentationSettings.grid.columns} × {project.presentationSettings.grid.rows}</span></div><Button className="viewfinder-preview-toggle" view="flat" size="l" selected={gridVisible} aria-label={gridVisible ? "Скрыть сетку" : "Показать сетку"} title={gridVisible ? "Скрыть сетку" : "Показать сетку"} onClick={() => setGridVisible((visible) => !visible)}><Icon data={gridVisible ? Eye : EyeSlash} size={22} /></Button><div className="canvas-stage"><SlideCanvas slide={current} settings={project.presentationSettings} selectedId={selectedId} editingId={editingId} preview={false} showGrid={gridVisible} externalDragType={dockDragType} onSelect={(id) => { setSelectedId(id); if (!id) setEditingId(null); }} onEdit={setEditingId} onMoveResize={(id, area) => updateCurrent((s) => ({ ...s, blocks: s.blocks.map((b) => b.id === id ? { ...b, grid: area } : b) }))} onResolveMove={(id, area, resolved) => updateCurrent((s) => ({ ...s, blocks: s.blocks.map((b) => b.id === id ? { ...b, grid: area } : resolved[b.id] ? { ...b, grid: resolved[b.id] } : b) }))} onDuplicateAt={duplicateBlockAt} onContent={(id, content) => updateCurrent((s) => ({ ...s, blocks: s.blocks.map((b) => b.id === id ? { ...b, content } : b) }))} onDropBlock={addBlock} /></div><div className="canvas-actions"><BlockDock onAdd={addBlock} onDragType={setDockDragType} /></div></section>
      <aside className="inspector"><div className="context-title"><span>{selected ? blockLabels[selected.type].label : "Страница"}</span>{selected && <small>{selected.type}</small>}</div>{selected ? <BlockInspector block={selected} patch={patchSelectedContent} upload={upload} duplicate={duplicateBlock} remove={removeSelected} /> : <PageInspector slide={current} slides={project.slides} settings={project.presentationSettings} updateSlide={(patch) => updateCurrent((slide) => ({ ...slide, ...patch }))} updateSettings={updatePresentationSettings} />}</aside>
    </div>
    <div className="mobile-warning">Редактор презентаций лучше работает на экране шириной от 1280 px.</div>
  </main></ThemeProvider>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span><div>{children}</div></label>; }

function DresserRange({ label, value, min, max, unit, onUpdate }: { label: string; value: number; min: number; max: number; unit: string; onUpdate: (value: number) => void }) {
  const progress = (value - min) / (max - min) * 100;
  return <label className="dresser-range" style={{ "--range-progress": `${progress}%` } as CSSProperties}><span>{label}</span><input aria-label={label} type="range" min={min} max={max} value={value} onChange={(e) => onUpdate(Number(e.target.value))} /><output>{value}{unit}</output></label>;
}

function DresserTabs({ value, options, onUpdate }: { value: string; options: string[]; onUpdate: (value: string) => void }) {
  return <div className="dresser-tabs">{options.map((option) => <button type="button" key={option} className={value === option ? "active" : ""} onClick={() => onUpdate(option)}>{option}</button>)}</div>;
}

function TableSizePicker({ rows, onUpdate }: { rows: string[][]; onUpdate: (rows: string[][]) => void }) {
  const current = { rows: Math.max(rows.length, 1), columns: Math.max(rows[0]?.length ?? 1, 1) }; const [open, setOpen] = useState(false); const [hovered, setHovered] = useState(current);
  const maxRows = 8; const maxColumns = 8;
  return <div className="table-size-control">
    <button className="table-size-trigger" type="button" aria-expanded={open} onClick={() => { setHovered(current); setOpen((value) => !value); }}><span className="table-size-mini" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</span><strong>{current.columns} × {current.rows}</strong><Icon data={ChevronDown} size={14} /></button>
    {open && <div className="table-size-popover" onPointerDown={(event) => event.stopPropagation()}><strong>{hovered.columns} × {hovered.rows}</strong><div className="table-size-grid">{Array.from({ length: maxRows * maxColumns }, (_, index) => { const row = Math.floor(index / maxColumns) + 1; const column = index % maxColumns + 1; const active = row <= hovered.rows && column <= hovered.columns; return <button type="button" key={`${row}-${column}`} className={active ? "active" : ""} aria-label={`${column} столбцов, ${row} строк`} onPointerEnter={() => setHovered({ rows: row, columns: column })} onClick={() => { onUpdate(resizeTable(rows, row, column)); setOpen(false); }} />; })}</div></div>}
  </div>;
}

function DesignCheckbox({ label, checked, onUpdate }: { label: string; checked: boolean; onUpdate: (checked: boolean) => void }) {
  return <label className="design-checkbox"><input type="checkbox" checked={checked} onChange={(event) => onUpdate(event.target.checked)} /><i aria-hidden="true">✓</i><span>{label}</span></label>;
}

const textColorPresets = ["#FFFFFF", "#000000", "#38A9C3"];
function TextColorPresets({ label, value, onUpdate }: { label: string; value: string; onUpdate: (value: string) => void }) {
  return <Field label={label}><div className="text-color-presets">{textColorPresets.map((color) => <button type="button" key={color} className={value.toUpperCase() === color ? "active" : ""} aria-label={`${label}: ${color}`} title={color} style={{ background: color }} onClick={() => onUpdate(color)}><span>{color}</span></button>)}</div></Field>;
}

function hexToHsv(hex: string) {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6); const r = parseInt(clean.slice(0, 2), 16) / 255; const g = parseInt(clean.slice(2, 4), 16) / 255; const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min; let h = 0;
  if (delta) h = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { h: h < 0 ? h + 360 : h, s: max ? delta / max : 0, v: max };
}

function hsvToHex(h: number, s: number, v: number) {
  const c = v * s; const x = c * (1 - Math.abs((h / 60) % 2 - 1)); const m = v - c; let rgb = [c, x, 0];
  if (h >= 60 && h < 120) rgb = [x, c, 0]; else if (h >= 120 && h < 180) rgb = [0, c, x]; else if (h >= 180 && h < 240) rgb = [0, x, c]; else if (h >= 240 && h < 300) rgb = [x, 0, c]; else if (h >= 300) rgb = [c, 0, x];
  return `#${rgb.map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function SolidColorPicker({ value, onUpdate }: { value: string; onUpdate: (value: string) => void }) {
  const safeValue = /^#[\da-f]{6}$/i.test(value) ? value.toUpperCase() : "#1C1C1C"; const hsv = hexToHsv(safeValue); const [draft, setDraft] = useState<string | null>(null); const shownValue = draft ?? safeValue;
  const updateSv = (event: ReactPointerEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); const s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); const v = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)); onUpdate(hsvToHex(hsv.h, s, v)); };
  const commitDraft = () => { if (draft && /^#[\da-f]{6}$/i.test(draft)) onUpdate(draft.toUpperCase()); setDraft(null); };
  return <div className="color-picker-panel">
    <div className="color-sv" style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateSv(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSv(event); }}><i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} /></div>
    <input className="color-hue" aria-label="Тон цвета" type="range" min={0} max={359} value={Math.round(hsv.h)} onChange={(event) => onUpdate(hsvToHex(Number(event.target.value), hsv.s, hsv.v))} />
    <div className="color-fields"><span>HEX</span><input value={shownValue} onChange={(event) => setDraft(event.target.value)} onBlur={commitDraft} onKeyDown={(event) => { if (event.key === "Enter") commitDraft(); }} /><b>100%</b></div>
  </div>;
}

function MockupInspector({ block, patch, upload }: { block: Block; patch: (p: Record<string, unknown>) => void; upload: (e: ChangeEvent<HTMLInputElement>) => void }) {
  const c = block.content; const model = (String(c.deviceModel ?? "iPhone 17") in deviceFrames ? String(c.deviceModel ?? "iPhone 17") : "iPhone 17") as DeviceModel;
  const colors = Object.keys(deviceFrames[model].colors); const color = colors.includes(String(c.deviceColor)) ? String(c.deviceColor) : colors[0];
  const backgroundMode = String(c.backgroundMode ?? "Image"); const backgroundStyle = String(c.backgroundStyle ?? "Mesh"); const backgroundPreset = String(c.backgroundPreset ?? "mesh"); const solidColor = String(c.background ?? "#1C1C1C"); const [colorOpen, setColorOpen] = useState(false);
  const uploadBackground = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => patch({ backgroundMode: "Image", backgroundStyle: "Mesh", backgroundImage: String(reader.result) }); reader.readAsDataURL(file); };
  return <div className="mockup-controls">
    {/* eslint-disable-next-line @next/next/no-img-element -- local user preview */}
    <Field label="Device"><label className="device-upload-card">{c.src ? <img src={String(c.src)} alt="Загруженный экран" /> : <span className="device-upload-preview">▧</span>}<strong>{c.src ? "screen.png" : "Добавить экран"}</strong><small>{model}</small><b>{c.src ? "Заменить" : "+"}</b><input type="file" accept="image/*" onChange={upload} /></label></Field>
    <Field label="Phone model"><select value={model} onChange={(e) => { const next = e.target.value as DeviceModel; patch({ deviceModel: next, deviceColor: Object.keys(deviceFrames[next].colors)[0] }); }}>{Object.keys(deviceFrames).map((option) => <option key={option}>{option}</option>)}</select></Field>
    <Field label="Phone color"><select value={color} onChange={(e) => patch({ deviceColor: e.target.value })}>{colors.map((option) => <option key={option}>{option}</option>)}</select></Field>
    <DresserRange label="Scale" value={Number(c.scale ?? 90)} min={35} max={180} unit="%" onUpdate={(scale) => patch({ scale })} />
    <DresserRange label="Horizontal" value={Number(c.horizontal ?? 0)} min={-320} max={320} unit="px" onUpdate={(horizontal) => patch({ horizontal })} />
    <DresserRange label="Vertical" value={Number(c.vertical ?? 0)} min={-240} max={240} unit="px" onUpdate={(vertical) => patch({ vertical })} />
    <section className="dresser-section"><span>Background</span><DresserTabs value={backgroundMode} options={["Image", "None"]} onUpdate={(backgroundMode) => patch({ backgroundMode })} />{backgroundMode === "Image" && <><DresserTabs value={backgroundStyle} options={["Solid", "Mesh"]} onUpdate={(backgroundStyle) => patch({ backgroundStyle })} />{backgroundStyle === "Solid" ? <div className="solid-color-control"><button type="button" className="solid-color-trigger" onClick={() => setColorOpen((open) => !open)}><i style={{ background: solidColor }} /><span>{solidColor.toUpperCase()}</span><b>{colorOpen ? "⌃" : "⌄"}</b></button>{colorOpen && <SolidColorPicker value={solidColor} onUpdate={(background) => patch({ background })} />}</div> : <><div className="background-presets">{Object.entries(backgroundPresets).map(([name, background]) => <button type="button" key={name} aria-label={`Фон ${name}`} className={!c.backgroundImage && backgroundPreset === name ? "active" : ""} style={{ background }} onClick={() => patch({ backgroundPreset: name, backgroundImage: "" })} />)}<label className={c.backgroundImage ? "background-upload active" : "background-upload"}><span>＋</span><small>Фото</small><input type="file" accept="image/*" onChange={uploadBackground} /></label></div></>}</>}</section>
  </div>;
}

function PageInspector({ slide, slides, settings, updateSlide, updateSettings }: { slide: Slide; slides: Slide[]; settings: PresentationSettings; updateSlide: (patch: Partial<Slide>) => void; updateSettings: (settings: PresentationSettings) => void }) {
  const [colorOpen, setColorOpen] = useState(false); const style = slide.backgroundStyle ?? "Solid"; const preset = slide.backgroundPreset ?? "wb-blue";
  const minColumns = Math.max(8, ...slides.flatMap((item) => item.blocks.map((block) => block.grid.x + block.grid.w))); const minRows = Math.max(6, ...slides.flatMap((item) => item.blocks.map((block) => block.grid.y + block.grid.h)));
  const patchPadding = (side: keyof PresentationSettings["padding"], value: number) => updateSettings({ ...settings, padding: { ...settings.padding, [side]: value } });
  const patchGrid = (key: "columns" | "rows" | "gap", value: number) => { const safeValue = key === "columns" ? Math.min(16, Math.max(minColumns, value)) : key === "rows" ? Math.min(12, Math.max(minRows, value)) : Math.min(24, Math.max(0, value)); updateSettings({ ...settings, grid: { ...settings.grid, [key]: safeValue } }); };
  const uploadBackground = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => updateSlide({ backgroundMode: "Image", backgroundStyle: "Mesh", backgroundImage: String(reader.result) }); reader.readAsDataURL(file); };
  return <div className="inspector-body page-settings">
    <section className="page-section"><strong>Фон страницы</strong><DresserTabs value={style} options={["Mesh", "Solid"]} onUpdate={(backgroundStyle) => updateSlide({ backgroundMode: "Image", backgroundStyle: backgroundStyle as Slide["backgroundStyle"] })} />{style === "Solid" ? <div className="solid-color-control"><button type="button" className="solid-color-trigger" onClick={() => setColorOpen((open) => !open)}><i style={{ background: slide.background }} /><span>{slide.background.toUpperCase()}</span><b>{colorOpen ? "⌃" : "⌄"}</b></button>{colorOpen && <SolidColorPicker value={slide.background} onUpdate={(background) => updateSlide({ backgroundMode: "Image", background })} />}</div> : <div className="background-presets page-backgrounds">{Object.entries(backgroundPresets).map(([name, background]) => <button type="button" key={name} aria-label={`Фон ${name}`} className={!slide.backgroundImage && preset === name ? "active" : ""} style={{ background }} onClick={() => updateSlide({ backgroundMode: "Image", backgroundPreset: name, backgroundImage: "" })} />)}<label className={slide.backgroundImage ? "background-upload active" : "background-upload"}><span>＋</span><small>Фото</small><input type="file" accept="image/*" onChange={uploadBackground} /></label></div>}</section>
    <section className="page-section"><strong>Слайды</strong><DesignCheckbox label="Показывать нумерацию" checked={settings.showSlideNumbers} onUpdate={(showSlideNumbers) => updateSettings({ ...settings, showSlideNumbers })} /></section>
    <section className="page-section"><strong>Отступы страницы</strong><div className="padding-grid"><Field label="Сверху"><NumberInput value={settings.padding.top} min={0} max={160} onUpdate={(value) => patchPadding("top", value ?? 0)} /></Field><Field label="Справа"><NumberInput value={settings.padding.right} min={0} max={160} onUpdate={(value) => patchPadding("right", value ?? 0)} /></Field><Field label="Снизу"><NumberInput value={settings.padding.bottom} min={0} max={160} onUpdate={(value) => patchPadding("bottom", value ?? 0)} /></Field><Field label="Слева"><NumberInput value={settings.padding.left} min={0} max={160} onUpdate={(value) => patchPadding("left", value ?? 0)} /></Field></div></section>
    <section className="page-section"><strong>Сетка</strong><DresserTabs value={settings.grid.cellRatio === "square" ? "1:1" : "Адаптивные"} options={["Адаптивные", "1:1"]} onUpdate={(value) => updateSettings({ ...settings, grid: { ...settings.grid, cellRatio: value === "1:1" ? "square" : "adaptive" } })} /><div className="position-grid"><Field label="Колонки"><NumberInput value={settings.grid.columns} min={minColumns} max={16} onUpdate={(value) => patchGrid("columns", value ?? minColumns)} /></Field><Field label="Строки"><NumberInput value={settings.grid.rows} min={minRows} max={12} onUpdate={(value) => patchGrid("rows", value ?? minRows)} /></Field></div><DresserRange label="Расстояние" value={settings.grid.gap} min={0} max={24} unit="px" onUpdate={(value) => patchGrid("gap", value)} /></section>
    <section className="page-section"><strong>Блоки</strong><DresserRange label="Скругление" value={settings.blockRadius} min={0} max={32} unit="px" onUpdate={(blockRadius) => updateSettings({ ...settings, blockRadius })} /></section>
  </div>;
}

function BlockInspector({ block, patch, upload, duplicate, remove }: { block: Block; patch: (p: Record<string, unknown>) => void; upload: (e: ChangeEvent<HTMLInputElement>) => void; duplicate: () => void; remove: () => void }) {
  const c = block.content;
  return <div className="inspector-body">
    {block.type === "text" && <><Field label="Вариант"><select value={String(c.variant)} onChange={(e) => patch({ variant: e.target.value, fontSize: undefined })}>{["heading", "subheading", "body", "insight"].map((x) => <option key={x}>{x}</option>)}</select></Field><Field label="Шрифт"><select value={String(c.fontFamily ?? "Inter")} onChange={(e) => patch({ fontFamily: e.target.value })}><option>Inter</option><option>Unbounded</option></select></Field><Field label="Размер шрифта"><NumberInput value={Number(c.fontSize ?? ({ heading: 52, subheading: 32, body: 18, insight: 20 } as Record<string, number>)[String(c.variant ?? "body")])} min={8} max={96} onUpdate={(value) => patch({ fontSize: value ?? 18 })} /></Field><TextColorPresets label="Цвет текста" value={String(c.textColor ?? "#000000")} onUpdate={(textColor) => patch({ textColor })} /><DesignCheckbox label="Добавить фон" checked={Boolean(c.backgroundEnabled)} onUpdate={(backgroundEnabled) => patch({ backgroundEnabled })} />{Boolean(c.backgroundEnabled) && <TextColorPresets label="Цвет фона" value={String(c.backgroundColor ?? "#FFFFFF")} onUpdate={(backgroundColor) => patch({ backgroundColor })} />}<Field label="Текст"><textarea rows={7} value={String(c.text)} onChange={(e) => patch({ text: e.target.value, html: undefined })} /></Field><p className="helper">Дважды нажмите на блок: доступны жирный текст, курсив, подчёркивание, списки и выравнивание.</p></>}
    {block.type === "metric" && <><Field label="Значение"><input value={String(c.value)} onChange={(e) => patch({ value: e.target.value })} /></Field><Field label="Подпись"><input value={String(c.label)} onChange={(e) => patch({ label: e.target.value })} /></Field><Field label="Сравнение"><input value={String(c.comparison)} onChange={(e) => patch({ comparison: e.target.value })} /></Field><Field label="Комментарий"><textarea rows={3} value={String(c.detail)} onChange={(e) => patch({ detail: e.target.value })} /></Field></>}
    {block.type === "image" && <><Field label="Изображение"><label className="upload-button">{c.src ? "Заменить" : "Загрузить"}<input type="file" accept="image/*" onChange={upload} /></label></Field><Field label="Вписывание"><select value={String(c.fit)} onChange={(e) => patch({ fit: e.target.value })}><option value="cover">Cover</option><option value="contain">Contain</option></select></Field><Field label="Выравнивание"><select value={String(c.align)} onChange={(e) => patch({ align: e.target.value })}>{["top", "center", "bottom"].map((x) => <option key={x}>{x}</option>)}</select></Field></>}
    {block.type === "mockup" && <MockupInspector block={block} patch={patch} upload={upload} />}
    {block.type === "chart" && <><Field label="Тип"><select value={String(c.chartType)} onChange={(e) => patch({ chartType: e.target.value })}><option>Bar</option><option>Line</option></select></Field><Field label="Данные"><textarea rows={7} value={(c.points as Array<{ label: string; value: number }>).map((p) => `${p.label} | ${p.value}`).join("\n")} onChange={(e) => patch({ points: e.target.value.split("\n").slice(0, 30).map((line) => { const [label, value] = line.split("|"); return { label: label?.trim() || "—", value: Number(value) || 0 }; }) })} /></Field></>}
    {block.type === "table" && <><Field label="Размер таблицы"><TableSizePicker rows={(c.rows as string[][]) ?? [[""]]} onUpdate={(rows) => patch({ rows })} /></Field><p className="helper">Дважды нажмите на таблицу, чтобы редактировать ячейки. Наведите на нижний край и нажмите «Строка», чтобы быстро продолжить таблицу.</p></>}
    {block.type === "divider" && <><Field label="Вариант"><select value={String(c.variant)} onChange={(e) => patch({ variant: e.target.value })}><option value="label">Section label</option><option value="line">Divider line</option></select></Field>{c.variant === "label" && <Field label="Подпись"><input value={String(c.label)} onChange={(e) => patch({ label: e.target.value })} /></Field>}</>}
    <div className="inspector-actions"><Button view="outlined" onClick={duplicate}><Icon data={Copy} size={16} />Дублировать</Button><Button view="outlined-danger" onClick={remove}><Icon data={TrashBin} size={16} />Удалить</Button></div></div>;
}
