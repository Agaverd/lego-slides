"use client";

import { ChangeEvent, CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, NumberInput, Slider, Tab, TabList, TabPanel, TabProvider, TextInput, ThemeProvider, configure } from "@gravity-ui/uikit";
import { ArrowRotateLeft, ArrowRotateRight, Copy, Eye, FileArrowDown, Gear, LayoutCells, Plus, TrashBin } from "@gravity-ui/icons";
import { Block, BlockType, GridArea, PresentationSettings, Project, Slide, createBlock, createDemoProject, defaultPresentationSettings, normalizeProject, presets } from "../domain";
import { LocalProjectRepository } from "../repository";

const repo = new LocalProjectRepository();
configure({ lang: "ru" });
const clone = <T,>(value: T): T => structuredClone(value);
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

function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function BlockContent({ block, editing, onContent }: { block: Block; editing: boolean; onContent: (content: Record<string, unknown>) => void }) {
  const c = block.content;
  if (block.type === "metric") {
    const variant = block.grid.w >= 6 && block.grid.h >= 4 ? "large" : block.grid.w >= 5 ? "medium" : "compact";
    return <div className={`metric metric-${variant}`}><strong>{String(c.value)}</strong><div className="metric-label">{String(c.label)}</div>{variant !== "compact" && <small>{String(c.comparison)}</small>}{variant === "large" && <p>{String(c.detail)}</p>}</div>;
  }
  if (block.type === "text") return <RichTextBlock block={block} editing={editing} onContent={onContent} />;
  if (block.type === "divider") return String(c.variant) === "line" ? <div className="divider-line" /> : <div className="divider-label">{String(c.label)}</div>;
  if (block.type === "image") return c.src ? <img className="block-image" src={String(c.src)} alt={String(c.alt ?? "")} style={{ objectFit: c.fit as "cover" | "contain", objectPosition: `center ${String(c.align ?? "center")}` }} /> : <EmptyMedia label="Добавьте изображение" />; // eslint-disable-line @next/next/no-img-element -- local data URLs are user content
  if (block.type === "mockup") return <Mockup block={block} />;
  if (block.type === "table") {
    const rows = c.rows as string[][];
    return <div className="table-wrap"><table><tbody>{rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} contentEditable={editing} suppressContentEditableWarning onBlur={(e) => { const next = clone(rows); next[ri][ci] = e.currentTarget.innerText; onContent({ ...c, rows: next }); }}>{cell}</td>)}</tr>)}</tbody></table></div>;
  }
  const points = c.points as Array<{ label: string; value: number }>;
  const max = Math.max(...points.map((p) => p.value), 1);
  return <div className={`chart chart-${String(c.chartType).toLowerCase()}`}>{points.map((p) => <div className="chart-item" key={p.label}><span>{p.value}</span><div style={{ height: `${Math.max(8, p.value / max * 72)}%` }} /><small>{p.label}</small></div>)}</div>;
}

function textToHtml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>");
}

function RichTextBlock({ block, editing, onContent }: { block: Block; editing: boolean; onContent: (content: Record<string, unknown>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const c = block.content;
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  return <div ref={ref} className={`text-block text-${String(c.variant)} ${editing ? "is-rich-editing" : ""}`} contentEditable={editing} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: String(c.html ?? textToHtml(String(c.text))) }} onBlur={(e) => onContent({ ...c, text: e.currentTarget.innerText, html: e.currentTarget.innerHTML })} />;
}

function RichTextToolbar() {
  const command = (name: string) => (e: ReactPointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.stopPropagation(); document.execCommand(name); };
  return <div className="rich-text-toolbar" onPointerDown={(e) => e.stopPropagation()}>
    <button type="button" aria-label="Полужирный" onPointerDown={command("bold")}><strong>B</strong></button>
    <button type="button" aria-label="Курсив" onPointerDown={command("italic")}><em>I</em></button>
    <button type="button" aria-label="По левому краю" onPointerDown={command("justifyLeft")}>≡</button>
    <button type="button" aria-label="По центру" onPointerDown={command("justifyCenter")}>≣</button>
    <button type="button" aria-label="По правому краю" onPointerDown={command("justifyRight")}>≡</button>
  </div>;
}

function EmptyMedia({ label }: { label: string }) { return <div className="empty-media"><span>▧</span>{label}</div>; }

function Mockup({ block }: { block: Block }) {
  const c = block.content; const preset = String(c.preset); const src = String(c.src ?? "");
  const screen = <div className="mockup-screen">{src ? <img src={src} alt="Скриншот продукта" style={{ objectFit: c.fit as "cover" | "contain" }} /> : <div className="product-skeleton"><i /><i /><i /><b /></div>}</div>; // eslint-disable-line @next/next/no-img-element -- local data URLs are user content
  return <div className={`mockup preset-${preset.toLowerCase().replaceAll(" ", "-").replace("/", "-")}`} style={{ background: String(c.background ?? "#EEF0F3"), padding: Number(c.padding ?? 16) }}>
    {preset === "Browser" && <div className="browser-frame"><div className="browser-bar"><i /><i /><i /><span>demo.product</span></div>{screen}</div>}
    {preset === "Desktop" && <div className="desktop-frame">{screen}<span /></div>}
    {preset === "Phone" && <div className="phone-frame">{screen}</div>}
    {preset === "Two phones" && <div className="phones"><div className="phone-frame">{screen}</div><div className="phone-frame secondary">{screen}</div></div>}
    {preset === "Before / After" && <div className="comparison"><div><span>ДО</span>{screen}</div><div><span>ПОСЛЕ</span>{screen}</div></div>}
  </div>;
}

type ResizeEdge = "left" | "right" | "top" | "bottom";
type FloatingArea = { x: number; y: number; w: number; h: number };

function getBlockStyle(area: FloatingArea, settings: PresentationSettings) {
  const { columns, rows, gap } = settings.grid;
  const padX = { left: settings.padding.left / 12, right: settings.padding.right / 12 };
  const padY = { top: settings.padding.top / 6.75, bottom: settings.padding.bottom / 6.75 };
  const gapX = gap / 12; const gapY = gap / 6.75;
  const cellW = (100 - padX.left - padX.right - gapX * (columns - 1)) / columns;
  const cellH = (100 - padY.top - padY.bottom - gapY * (rows - 1)) / rows;
  return {
    left: `${padX.left + area.x * (cellW + gapX)}%`, top: `${padY.top + area.y * (cellH + gapY)}%`,
    width: `${area.w * cellW + (area.w - 1) * gapX}%`, height: `${area.h * cellH + (area.h - 1) * gapY}%`,
    "--block-radius": `${settings.blockRadius}px`, "--edge-zone-x": `${100 / Math.max(area.w, 1)}%`, "--edge-zone-y": `${100 / Math.max(area.h, 1)}%`,
  } as CSSProperties;
}

const magnetic = (value: number) => {
  const target = Math.round(value); const distance = Math.abs(value - target); const radius = 0.24;
  if (distance >= radius) return value;
  const t = 1 - distance / radius; const eased = t * t * (3 - 2 * t);
  return value + (target - value) * eased;
};

/* eslint-disable react-hooks/refs -- canvasRef is read only after a pointer or drop event starts, never during render */
function SlideCanvas({ slide, settings, selectedId, editingId, preview, onSelect, onEdit, onMoveResize, onContent, onDropBlock }: {
  slide: Slide; settings: PresentationSettings; selectedId: string | null; editingId: string | null; preview: boolean;
  onSelect: (id: string | null) => void; onEdit: (id: string | null) => void; onMoveResize: (id: string, area: GridArea) => void; onContent: (id: string, content: Record<string, unknown>) => void; onDropBlock?: (type: BlockType, origin: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<{ id: string; area: FloatingArea } | null>(null);
  const startPointer = (e: ReactPointerEvent, block: Block, mode: "move" | ResizeEdge) => {
    if (preview || editingId === block.id) return;
    e.stopPropagation(); e.preventDefault(); onSelect(block.id);
    const canvas = canvasRef.current; if (!canvas) return;
    const start = { x: e.clientX, y: e.clientY, grid: { ...block.grid } };
    const rect = canvas.getBoundingClientRect();
    const padLeft = rect.width * settings.padding.left / 1200; const padRight = rect.width * settings.padding.right / 1200;
    const padTop = rect.height * settings.padding.top / 675; const padBottom = rect.height * settings.padding.bottom / 675;
    const gapX = rect.width * settings.grid.gap / 1200; const gapY = rect.height * settings.grid.gap / 675;
    const pitchX = (rect.width - padLeft - padRight - gapX * (settings.grid.columns - 1)) / settings.grid.columns + gapX;
    const pitchY = (rect.height - padTop - padBottom - gapY * (settings.grid.rows - 1)) / settings.grid.rows + gapY;
    let live: FloatingArea = { ...start.grid };
    const move = (event: PointerEvent) => {
      const dx = (event.clientX - start.x) / pitchX; const dy = (event.clientY - start.y) / pitchY;
      let next: FloatingArea = { ...start.grid };
      if (mode === "move") next = { ...next, x: start.grid.x + dx, y: start.grid.y + dy };
      if (mode === "right") next.w = start.grid.w + dx;
      if (mode === "bottom") next.h = start.grid.h + dy;
      if (mode === "left") next = { ...next, x: start.grid.x + dx, w: start.grid.w - dx };
      if (mode === "top") next = { ...next, y: start.grid.y + dy, h: start.grid.h - dy };
      if (mode === "move") { next.x = Math.max(0, Math.min(settings.grid.columns - next.w, magnetic(next.x))); next.y = Math.max(0, Math.min(settings.grid.rows - next.h, magnetic(next.y))); }
      if (mode === "right") next.w = Math.max(1, Math.min(settings.grid.columns - next.x, magnetic(next.w)));
      if (mode === "bottom") next.h = Math.max(1, Math.min(settings.grid.rows - next.y, magnetic(next.h)));
      if (mode === "left") { const right = start.grid.x + start.grid.w; next.x = Math.max(0, Math.min(right - 1, magnetic(next.x))); next.w = right - next.x; }
      if (mode === "top") { const bottom = start.grid.y + start.grid.h; next.y = Math.max(0, Math.min(bottom - 1, magnetic(next.y))); next.h = bottom - next.y; }
      live = next; setInteraction({ id: block.id, area: next });
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      const snapped = { x: Math.round(live.x), y: Math.round(live.y), w: Math.round(live.w), h: Math.round(live.h) };
      const finalArea = canPlace(snapped, slide.blocks, settings.grid.columns, settings.grid.rows, block.id) ? snapped : start.grid;
      setInteraction({ id: block.id, area: finalArea }); onMoveResize(block.id, finalArea);
      window.setTimeout(() => setInteraction(null), 120);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const dropBlock = (e: ReactDragEvent<HTMLDivElement>) => {
    const type = e.dataTransfer.getData("application/x-demo-block") as BlockType;
    if (!onDropBlock || !["text", "metric", "mockup", "image", "table", "chart", "divider"].includes(type)) return;
    e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - settings.padding.left / 1200 * rect.width) / ((rect.width - (settings.padding.left + settings.padding.right) / 1200 * rect.width) / settings.grid.columns));
    const y = Math.floor((e.clientY - rect.top - settings.padding.top / 675 * rect.height) / ((rect.height - (settings.padding.top + settings.padding.bottom) / 675 * rect.height) / settings.grid.rows));
    onDropBlock(type, { x: Math.max(0, Math.min(settings.grid.columns - 1, x)), y: Math.max(0, Math.min(settings.grid.rows - 1, y)) });
  };
  const canvasStyle = { background: settings.slideColor, "--grid-columns": settings.grid.columns, "--grid-rows": settings.grid.rows, "--grid-gap": `${settings.grid.gap}px`, "--grid-radius": `${Math.max(4, settings.blockRadius)}px` } as CSSProperties;
  return <div ref={canvasRef} className={`slide-canvas ${preview ? "is-preview" : ""}`} style={canvasStyle} onPointerDown={() => onSelect(null)} onDragOver={(e) => { if (onDropBlock) e.preventDefault(); }} onDrop={dropBlock} role="presentation">
    {!preview && <div className="grid-cells" style={{ inset: `${settings.padding.top / 6.75}% ${settings.padding.right / 12}% ${settings.padding.bottom / 6.75}% ${settings.padding.left / 12}%` }}>{Array.from({ length: settings.grid.columns * settings.grid.rows }, (_, index) => <i key={index} />)}</div>}
    {slide.blocks.length === 0 && <div className="empty-slide"><strong>Пустой слайд</strong><span>Добавьте первый блок</span></div>}
    {slide.blocks.map((block) => <div key={block.id} className={`slide-block block-${block.type} ${selectedId === block.id ? "is-selected" : ""} ${interaction?.id === block.id ? "is-interacting" : ""}`} style={getBlockStyle(interaction?.id === block.id ? interaction.area : block.grid, settings)} onPointerDown={(e) => startPointer(e, block, "move")} onDoubleClick={(e) => { e.stopPropagation(); onSelect(block.id); if (block.type === "text" || block.type === "table") onEdit(block.id); }}>
      {editingId === block.id && block.type === "text" && <RichTextToolbar />}
      <div className="block-inner"><BlockContent block={block} editing={editingId === block.id} onContent={(content) => onContent(block.id, content)} /></div>
      {!preview && (["top", "right", "bottom", "left"] as ResizeEdge[]).map((edge) => <button key={edge} className={`edge-resize edge-resize-${edge}`} aria-label={`Изменить размер: ${edge}`} onPointerDown={(e) => startPointer(e, block, edge)}><span /></button>)}
    </div>)}
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

function BlockPalette({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return <div className="block-palette"><div className="palette-heading"><strong>Блоки</strong><span>Перетащите на холст</span></div><div className="palette-grid">{(Object.keys(blockLabels) as BlockType[]).map((type) => <button key={type} type="button" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("application/x-demo-block", type); }} onClick={() => onAdd(type)}><span>{blockLabels[type].icon}</span>{blockLabels[type].label}</button>)}</div></div>;
}

export function DemoSlidesEditor() {
  const [project, setProject] = useState<Project>(() => createDemoProject());
  const [currentId, setCurrentId] = useState(""); const [selectedId, setSelectedId] = useState<string | null>(null); const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false); const [addBlockOpen, setAddBlockOpen] = useState(false); const [presetOpen, setPresetOpen] = useState(false); const [notice, setNotice] = useState(""); const [ready, setReady] = useState(false);
  const [past, setPast] = useState<Project[]>([]); const [future, setFuture] = useState<Project[]>([]); const [dragSlideId, setDragSlideId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState("context");

  useEffect(() => { repo.getProject("current").then((saved) => { const fallback = createDemoProject(); const p = saved ? { ...saved, presentationSettings: { ...defaultPresentationSettings, ...saved.presentationSettings, padding: { ...defaultPresentationSettings.padding, ...saved.presentationSettings?.padding }, grid: { ...defaultPresentationSettings.grid, ...saved.presentationSettings?.grid } } } : fallback; setProject(p); setCurrentId(p.slides[0]?.id ?? ""); setReady(true); }); }, []);
  useEffect(() => { if (!ready) return; const timer = setTimeout(() => repo.saveProject({ ...project, updatedAt: new Date().toISOString() }).then(() => setNotice("Сохранено")).catch(() => setNotice("Не удалось сохранить: хранилище браузера заполнено")), 350); return () => clearTimeout(timer); }, [project, ready]);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(""), 1400); return () => clearTimeout(t); } }, [notice]);

  const current = project.slides.find((s) => s.id === currentId) ?? project.slides[0];
  const selected = current?.blocks.find((b) => b.id === selectedId) ?? null;
  const commit = useCallback((next: Project | ((p: Project) => Project)) => { setProject((p) => { const value = typeof next === "function" ? next(p) : next; setPast((h) => [...h.slice(-49), clone(p)]); setFuture([]); return value; }); }, []);
  const updateCurrent = useCallback((fn: (s: Slide) => Slide) => commit((p) => ({ ...p, slides: p.slides.map((s) => s.id === currentId ? fn(s) : s) })), [commit, currentId]);
  const undo = useCallback(() => { setPast((h) => { const previous = h.at(-1); if (!previous) return h; setFuture((f) => [clone(project), ...f]); setProject(previous); return h.slice(0, -1); }); }, [project]);
  const redo = useCallback(() => { setFuture((f) => { const next = f[0]; if (!next) return f; setPast((h) => [...h, clone(project)]); setProject(next); return f.slice(1); }); }, [project]);

  const removeSelected = useCallback(() => { if (!selectedId) return; updateCurrent((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== selectedId) })); setSelectedId(null); }, [selectedId, updateCurrent]);
  const duplicateBlock = useCallback(() => { if (!selected || !current) return; const { columns, rows } = project.presentationSettings.grid; const area = findBestSpace(current.blocks, selected.grid.w, selected.grid.h, columns, rows, { x: selected.grid.x + 1, y: selected.grid.y + 1 }); if (!area) { setNotice("На слайде нет места для копии"); return; } const copy = { ...clone(selected), id: crypto.randomUUID(), grid: area }; updateCurrent((s) => ({ ...s, blocks: [...s.blocks, copy] })); setSelectedId(copy.id); setNotice(area.w < selected.grid.w || area.h < selected.grid.h ? "Копия уменьшена до свободного места" : "Блок продублирован"); }, [selected, current, project.presentationSettings.grid, updateCurrent]);
  const patchSelectedContent = useCallback((patch: Record<string, unknown>) => { if (!selected) return; updateCurrent((s) => ({ ...s, blocks: s.blocks.map((b) => b.id === selected.id ? { ...b, content: { ...b.content, ...patch } } : b) })); }, [selected, updateCurrent]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const input = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable);
      if (e.key === "Escape") { setEditingId(null); setSelectedId(null); setAddBlockOpen(false); setPresetOpen(false); }
      if (input) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) { e.preventDefault(); removeSelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateBlock(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [selectedId, removeSelected, duplicateBlock, undo, redo]);
  useEffect(() => {
    const paste = (e: ClipboardEvent) => { const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/")); if (!file || !selected || !["image", "mockup"].includes(selected.type)) return; const reader = new FileReader(); reader.onload = () => patchSelectedContent({ src: String(reader.result) }); reader.readAsDataURL(file); };
    window.addEventListener("paste", paste); return () => window.removeEventListener("paste", paste);
  }, [selected, patchSelectedContent]);
  const addBlock = (type: BlockType, origin?: { x: number; y: number }) => { if (!current) return; const block = createBlock(type); const { columns, rows } = project.presentationSettings.grid; const area = findBestSpace(current.blocks, block.grid.w, block.grid.h, columns, rows, origin); if (!area) { setNotice("На слайде нет свободного места"); return; } block.grid = area; updateCurrent((s) => ({ ...s, blocks: [...s.blocks, block] })); setSelectedId(block.id); setInspectorTab("context"); setAddBlockOpen(false); };
  const addSlide = (name: keyof typeof presets) => { const id = crypto.randomUUID(); const blocks = clone(presets[name]).map((b) => ({ ...createBlock((b.type ?? "text") as BlockType), ...b, id: crypto.randomUUID() })) as Block[]; const next = { id, order: project.slides.length, title: String(name), background: "#FFFFFF", blocks }; commit((p) => ({ ...p, slides: [...p.slides, next] })); setCurrentId(id); setSelectedId(null); setPresetOpen(false); };
  const duplicateSlide = (id: string) => { const source = project.slides.find((s) => s.id === id); if (!source) return; const copy = { ...clone(source), id: crypto.randomUUID(), title: `${source.title} — копия`, blocks: source.blocks.map((b) => ({ ...b, id: crypto.randomUUID() })) }; commit((p) => ({ ...p, slides: [...p.slides, copy].map((s, i) => ({ ...s, order: i })) })); setCurrentId(copy.id); };
  const deleteSlide = (id: string) => { if (project.slides.length === 1) { setNotice("В презентации должен остаться один слайд"); return; } const left = project.slides.filter((s) => s.id !== id); commit({ ...project, slides: left.map((s, i) => ({ ...s, order: i })) }); if (currentId === id) setCurrentId(left[0].id); };
  const reorder = (targetId: string) => { if (!dragSlideId || dragSlideId === targetId) return; const list = [...project.slides]; const from = list.findIndex((s) => s.id === dragSlideId); const to = list.findIndex((s) => s.id === targetId); const [moved] = list.splice(from, 1); list.splice(to, 0, moved); commit({ ...project, slides: list.map((s, i) => ({ ...s, order: i })) }); setDragSlideId(null); };
  const upload = (e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => patchSelectedContent({ src: String(reader.result) }); reader.readAsDataURL(file); };
  const exportPresentation = () => { downloadJson(normalizeProject(project), `${project.title.toLowerCase().replaceAll(" ", "-")}.presentation.json`); setNotice("Структура презентации экспортирована"); };
  const updatePresentationSettings = (settings: PresentationSettings) => commit((p) => ({ ...p, presentationSettings: settings }));

  if (!ready || !current) return <div className="app-loading"><span />Загружаем презентацию…</div>;
  return <ThemeProvider theme="dark"><main className="editor-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">D</span><TextInput aria-label="Название проекта" value={project.title} onUpdate={(title) => commit({ ...project, title })} size="m" /></div><div className="save-state">{notice || "Автосохранение включено"}</div><div className="top-actions"><Button view="flat" onClick={undo} disabled={!past.length} aria-label="Отменить"><Icon data={ArrowRotateLeft} size={16} /></Button><Button view="flat" onClick={redo} disabled={!future.length} aria-label="Повторить"><Icon data={ArrowRotateRight} size={16} /></Button><div className="segmented"><Button view={!preview ? "normal" : "flat"} onClick={() => setPreview(false)}>Редактор</Button><Button view={preview ? "normal" : "flat"} onClick={() => { setPreview(true); setSelectedId(null); }}><Icon data={Eye} size={16} />Превью</Button></div><Button view="action" onClick={exportPresentation}><Icon data={FileArrowDown} size={16} />Экспорт</Button></div></header>
    <div className="workspace">
      <aside className="slides-panel"><div className="panel-title"><span>Слайды</span><small>{project.slides.length}</small></div><div className="slide-list">{project.slides.map((s, i) => <div key={s.id} className={`thumbnail-row ${s.id === current.id ? "active" : ""}`} draggable tabIndex={0} role="button" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setCurrentId(s.id); setSelectedId(null); } }} onDragStart={() => setDragSlideId(s.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(s.id)} onClick={() => { setCurrentId(s.id); setSelectedId(null); }}><span className="slide-number">{String(i + 1).padStart(2, "0")}</span><SlideThumbnail slide={s} settings={project.presentationSettings} /><div className="thumb-actions"><Button view="flat" onClick={(e) => { e.stopPropagation(); duplicateSlide(s.id); }} title="Дублировать"><Icon data={Copy} size={14} /></Button><Button view="flat-danger" onClick={(e) => { e.stopPropagation(); deleteSlide(s.id); }} title="Удалить"><Icon data={TrashBin} size={14} /></Button></div></div>)}</div><div className="add-wrap"><Button view="outlined-action" width="max" onClick={() => setPresetOpen(!presetOpen)}><Icon data={Plus} size={16} />Добавить слайд</Button>{presetOpen && <div className="popover presets"><strong>Выберите раскладку</strong>{Object.keys(presets).map((p) => <button key={p} onClick={() => addSlide(p as keyof typeof presets)}><span className="preset-icon" />{p}</button>)}</div>}</div></aside>
      <section className="canvas-area"><div className="canvas-toolbar"><span>Слайд {current.order + 1}</span><span>16:9 · {project.presentationSettings.grid.columns} × {project.presentationSettings.grid.rows}</span></div><div className="canvas-stage"><SlideCanvas slide={current} settings={project.presentationSettings} selectedId={selectedId} editingId={editingId} preview={preview} onSelect={(id) => { setSelectedId(id); if (!id) setEditingId(null); }} onEdit={setEditingId} onMoveResize={(id, area) => updateCurrent((s) => ({ ...s, blocks: s.blocks.map((b) => b.id === id ? { ...b, grid: area } : b) }))} onContent={(id, content) => updateCurrent((s) => ({ ...s, blocks: s.blocks.map((b) => b.id === id ? { ...b, content } : b) }))} onDropBlock={addBlock} /></div>{!preview && <div className="canvas-actions"><Button view="action" size="l" onClick={() => setAddBlockOpen(!addBlockOpen)}><Icon data={Plus} size={18} />Добавить блок</Button>{addBlockOpen && <div className="popover blocks"><div className="menu-label">Добавить блок</div>{(Object.keys(blockLabels) as BlockType[]).map((type) => <button key={type} onClick={() => addBlock(type)}><span>{blockLabels[type].icon}</span>{blockLabels[type].label}</button>)}</div>}</div>}</section>
      <aside className="inspector"><TabProvider value={inspectorTab} onUpdate={setInspectorTab}><div className="inspector-tabs"><TabList size="m"><Tab value="context" icon={<Icon data={LayoutCells} size={16} />}>Объект</Tab><Tab value="presentation" icon={<Icon data={Gear} size={16} />}>Презентация</Tab></TabList></div><TabPanel value="context"><BlockPalette onAdd={addBlock} /><div className="panel-title"><span>{selected ? "Настройки блока" : "Настройки слайда"}</span>{selected && <small>{selected.type}</small>}</div>{selected ? <BlockInspector block={selected} patch={patchSelectedContent} upload={upload} duplicate={duplicateBlock} remove={removeSelected} /> : <div className="inspector-body"><Field label="Фон текущего слайда"><div className="read-only">Используется цвет презентации</div></Field><Field label="Тема"><div className="read-only">Demo Default</div></Field><div className="tip"><strong>Быстрый старт</strong><p>Перетащите блок на холст или дважды нажмите на текст, чтобы отредактировать его.</p></div></div>}</TabPanel><TabPanel value="presentation"><PresentationInspector project={project} update={updatePresentationSettings} /></TabPanel></TabProvider></aside>
    </div>
    <div className="mobile-warning">Редактор презентаций лучше работает на экране шириной от 1280 px.</div>
  </main></ThemeProvider>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span><div>{children}</div></label>; }

function PresentationInspector({ project, update }: { project: Project; update: (settings: PresentationSettings) => void }) {
  const settings = project.presentationSettings;
  const minColumns = Math.max(8, ...project.slides.flatMap((slide) => slide.blocks.map((block) => block.grid.x + block.grid.w)));
  const minRows = Math.max(6, ...project.slides.flatMap((slide) => slide.blocks.map((block) => block.grid.y + block.grid.h)));
  const patchPadding = (side: keyof PresentationSettings["padding"], value: number) => update({ ...settings, padding: { ...settings.padding, [side]: value } });
  const patchGrid = (key: keyof PresentationSettings["grid"], value: number) => {
    const safeValue = key === "columns" ? Math.min(16, Math.max(minColumns, value)) : key === "rows" ? Math.min(12, Math.max(minRows, value)) : Math.min(24, Math.max(0, value));
    update({ ...settings, grid: { ...settings.grid, [key]: safeValue } });
  };
  return <div className="inspector-body presentation-settings">
    <div className="settings-heading"><Icon data={Gear} size={18} /><div><strong>Вся презентация</strong><p>Эти параметры применяются ко всем слайдам и блокам.</p></div></div>
    <Field label="Цвет слайдов"><input type="color" value={settings.slideColor} onChange={(e) => update({ ...settings, slideColor: e.target.value })} /><TextInput value={settings.slideColor} onUpdate={(slideColor) => update({ ...settings, slideColor })} /></Field>
    <div className="settings-section"><strong>Отступы слайда</strong><div className="padding-grid"><Field label="Сверху"><NumberInput value={settings.padding.top} min={0} max={160} onUpdate={(value) => patchPadding("top", value ?? 0)} /></Field><Field label="Справа"><NumberInput value={settings.padding.right} min={0} max={160} onUpdate={(value) => patchPadding("right", value ?? 0)} /></Field><Field label="Снизу"><NumberInput value={settings.padding.bottom} min={0} max={160} onUpdate={(value) => patchPadding("bottom", value ?? 0)} /></Field><Field label="Слева"><NumberInput value={settings.padding.left} min={0} max={160} onUpdate={(value) => patchPadding("left", value ?? 0)} /></Field></div></div>
    <div className="settings-section"><strong>Сетка</strong><div className="position-grid"><Field label="Колонки"><NumberInput value={settings.grid.columns} min={minColumns} max={16} onUpdate={(value) => patchGrid("columns", value ?? minColumns)} /></Field><Field label="Строки"><NumberInput value={settings.grid.rows} min={minRows} max={12} onUpdate={(value) => patchGrid("rows", value ?? minRows)} /></Field></div><Field label="Расстояние между клетками"><div className="slider-input-row"><Slider value={settings.grid.gap} min={0} max={24} step={1} marks={0} onUpdate={(value) => patchGrid("gap", Number(value))} /><NumberInput value={settings.grid.gap} min={0} max={24} onUpdate={(value) => patchGrid("gap", value ?? 0)} endContent="px" /></div></Field></div>
    <div className="settings-section"><strong>Блоки</strong><Field label="Скругление"><div className="slider-input-row"><Slider value={settings.blockRadius} min={0} max={32} step={1} marks={0} onUpdate={(value) => update({ ...settings, blockRadius: Number(value) })} /><NumberInput value={settings.blockRadius} min={0} max={32} onUpdate={(value) => update({ ...settings, blockRadius: value ?? 0 })} endContent="px" /></div></Field></div>
  </div>;
}

function BlockInspector({ block, patch, upload, duplicate, remove }: { block: Block; patch: (p: Record<string, unknown>) => void; upload: (e: ChangeEvent<HTMLInputElement>) => void; duplicate: () => void; remove: () => void }) {
  const c = block.content;
  return <div className="inspector-body"><div className="position-grid"><Field label="X"><input value={block.grid.x + 1} readOnly /></Field><Field label="Y"><input value={block.grid.y + 1} readOnly /></Field><Field label="Ширина"><input value={block.grid.w} readOnly /></Field><Field label="Высота"><input value={block.grid.h} readOnly /></Field></div>
    {block.type === "text" && <><Field label="Вариант"><select value={String(c.variant)} onChange={(e) => patch({ variant: e.target.value })}>{["heading", "subheading", "body", "insight"].map((x) => <option key={x}>{x}</option>)}</select></Field><Field label="Текст"><textarea rows={7} value={String(c.text)} onChange={(e) => patch({ text: e.target.value, html: undefined })} /></Field><p className="helper">Дважды нажмите на текстовый блок для визуального форматирования.</p></>}
    {block.type === "metric" && <><Field label="Значение"><input value={String(c.value)} onChange={(e) => patch({ value: e.target.value })} /></Field><Field label="Подпись"><input value={String(c.label)} onChange={(e) => patch({ label: e.target.value })} /></Field><Field label="Сравнение"><input value={String(c.comparison)} onChange={(e) => patch({ comparison: e.target.value })} /></Field><Field label="Комментарий"><textarea rows={3} value={String(c.detail)} onChange={(e) => patch({ detail: e.target.value })} /></Field></>}
    {(block.type === "image" || block.type === "mockup") && <><Field label="Скриншот"><label className="upload-button">{c.src ? "Заменить" : "Загрузить"}<input type="file" accept="image/*" onChange={upload} /></label></Field><Field label="Вписывание"><select value={String(c.fit)} onChange={(e) => patch({ fit: e.target.value })}><option value="cover">Cover</option><option value="contain">Contain</option></select></Field></>}
    {block.type === "image" && <Field label="Выравнивание"><select value={String(c.align)} onChange={(e) => patch({ align: e.target.value })}>{["top", "center", "bottom"].map((x) => <option key={x}>{x}</option>)}</select></Field>}
    {block.type === "mockup" && <><Field label="Устройство"><select value={String(c.preset)} onChange={(e) => patch({ preset: e.target.value })}>{["Browser", "Desktop", "Phone", "Two phones", "Before / After"].map((x) => <option key={x}>{x}</option>)}</select></Field><Field label="Фон"><input type="color" value={String(c.background)} onChange={(e) => patch({ background: e.target.value })} /><input value={String(c.background)} onChange={(e) => patch({ background: e.target.value })} /></Field><Field label={`Отступ · ${String(c.padding)} px`}><input type="range" min="0" max="40" value={Number(c.padding)} onChange={(e) => patch({ padding: Number(e.target.value) })} /></Field></>}
    {block.type === "chart" && <><Field label="Тип"><select value={String(c.chartType)} onChange={(e) => patch({ chartType: e.target.value })}><option>Bar</option><option>Line</option></select></Field><Field label="Данные"><textarea rows={7} value={(c.points as Array<{ label: string; value: number }>).map((p) => `${p.label} | ${p.value}`).join("\n")} onChange={(e) => patch({ points: e.target.value.split("\n").slice(0, 30).map((line) => { const [label, value] = line.split("|"); return { label: label?.trim() || "—", value: Number(value) || 0 }; }) })} /></Field></>}
    {block.type === "table" && <><Field label="Строки"><div className="stepper"><button onClick={() => patch({ rows: (c.rows as string[][]).slice(0, -1) })} disabled={(c.rows as string[][]).length <= 1}>−</button><span>{(c.rows as string[][]).length}</span><button onClick={() => { const rows = c.rows as string[][]; patch({ rows: [...rows, Array(rows[0]?.length || 2).fill("")] .slice(0, 30) }); }}>＋</button></div></Field><p className="helper">Дважды нажмите на таблицу и редактируйте ячейки прямо на слайде.</p></>}
    {block.type === "divider" && <><Field label="Вариант"><select value={String(c.variant)} onChange={(e) => patch({ variant: e.target.value })}><option value="label">Section label</option><option value="line">Divider line</option></select></Field>{c.variant === "label" && <Field label="Подпись"><input value={String(c.label)} onChange={(e) => patch({ label: e.target.value })} /></Field>}</>}
    <div className="inspector-actions"><Button view="outlined" onClick={duplicate}><Icon data={Copy} size={16} />Дублировать</Button><Button view="outlined-danger" onClick={remove}><Icon data={TrashBin} size={16} />Удалить</Button></div></div>;
}
