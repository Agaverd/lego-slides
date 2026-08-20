"use client";

import { ChangeEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Block, BlockType, GridArea, Project, Slide, createBlock, createDemoProject, normalizeProject, presets } from "../domain";
import { LocalProjectRepository } from "../repository";

const repo = new LocalProjectRepository();
const clone = <T,>(value: T): T => structuredClone(value);
const overlaps = (a: GridArea, b: GridArea) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const canPlace = (area: GridArea, blocks: Block[], ignoreId?: string) => area.x >= 0 && area.y >= 0 && area.x + area.w <= 12 && area.y + area.h <= 8 && !blocks.some((b) => b.id !== ignoreId && overlaps(area, b.grid));

function findSpace(blocks: Block[], width: number, height: number) {
  for (let y = 0; y <= 8 - height; y++) for (let x = 0; x <= 12 - width; x++) {
    const area = { x, y, w: width, h: height };
    if (canPlace(area, blocks)) return area;
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
  if (block.type === "text") return <div className={`text-block text-${String(c.variant)}`} contentEditable={editing} suppressContentEditableWarning onBlur={(e) => onContent({ ...c, text: e.currentTarget.innerText })}>{String(c.text)}</div>;
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
    {(c.annotations as Array<{ type: string; label?: string }> | undefined)?.map((a, i) => <span key={i} className={`annotation annotation-${a.type.toLowerCase()}`}>{a.type === "Label" ? a.label || "Важно" : a.type === "Arrow" ? "↗" : ""}</span>)}
  </div>;
}

function SlideCanvas({ slide, selectedId, editingId, preview, onSelect, onEdit, onMoveResize, onContent }: {
  slide: Slide; selectedId: string | null; editingId: string | null; preview: boolean;
  onSelect: (id: string | null) => void; onEdit: (id: string | null) => void; onMoveResize: (id: string, area: GridArea) => void; onContent: (id: string, content: Record<string, unknown>) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const startPointer = (e: ReactPointerEvent, block: Block, mode: "move" | "resize") => {
    if (preview || editingId === block.id) return;
    e.stopPropagation(); e.preventDefault(); onSelect(block.id);
    const canvas = canvasRef.current; if (!canvas) return;
    const start = { x: e.clientX, y: e.clientY, grid: block.grid };
    const rect = canvas.getBoundingClientRect();
    const move = (event: PointerEvent) => {
      const dx = Math.round((event.clientX - start.x) / (rect.width / 12));
      const dy = Math.round((event.clientY - start.y) / (rect.height / 8));
      const next = mode === "move" ? { ...start.grid, x: start.grid.x + dx, y: start.grid.y + dy } : { ...start.grid, w: Math.max(1, start.grid.w + dx), h: Math.max(1, start.grid.h + dy) };
      if (canPlace(next, slide.blocks, block.id)) onMoveResize(block.id, next);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  return <div ref={canvasRef} className={`slide-canvas ${preview ? "is-preview" : ""}`} style={{ background: slide.background }} onPointerDown={() => onSelect(null)} role="presentation">
    {!preview && <div className="grid-lines" />}
    {slide.blocks.length === 0 && <div className="empty-slide"><strong>Пустой слайд</strong><span>Добавьте первый блок</span></div>}
    {slide.blocks.map((block) => <div key={block.id} className={`slide-block block-${block.type} ${selectedId === block.id ? "is-selected" : ""}`} style={{ left: `${block.grid.x / 12 * 100}%`, top: `${block.grid.y / 8 * 100}%`, width: `${block.grid.w / 12 * 100}%`, height: `${block.grid.h / 8 * 100}%` }} onPointerDown={(e) => startPointer(e, block, "move")} onDoubleClick={(e) => { e.stopPropagation(); onSelect(block.id); onEdit(block.id); }}>
      <div className="block-inner"><BlockContent block={block} editing={editingId === block.id} onContent={(content) => onContent(block.id, content)} /></div>
      {!preview && selectedId === block.id && <button className="resize-handle" aria-label="Изменить размер блока" onPointerDown={(e) => startPointer(e, block, "resize")} />}
    </div>)}
  </div>;
}

export function DemoSlidesEditor() {
  const [project, setProject] = useState<Project>(() => createDemoProject());
  const [currentId, setCurrentId] = useState(""); const [selectedId, setSelectedId] = useState<string | null>(null); const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false); const [addBlockOpen, setAddBlockOpen] = useState(false); const [presetOpen, setPresetOpen] = useState(false); const [notice, setNotice] = useState(""); const [ready, setReady] = useState(false);
  const [past, setPast] = useState<Project[]>([]); const [future, setFuture] = useState<Project[]>([]); const [dragSlideId, setDragSlideId] = useState<string | null>(null);

  useEffect(() => { repo.getProject("current").then((saved) => { const p = saved ?? createDemoProject(); setProject(p); setCurrentId(p.slides[0]?.id ?? ""); setReady(true); }); }, []);
  useEffect(() => { if (!ready) return; const timer = setTimeout(() => repo.saveProject({ ...project, updatedAt: new Date().toISOString() }).then(() => setNotice("Сохранено")).catch(() => setNotice("Не удалось сохранить: хранилище браузера заполнено")), 350); return () => clearTimeout(timer); }, [project, ready]);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(""), 1400); return () => clearTimeout(t); } }, [notice]);

  const current = project.slides.find((s) => s.id === currentId) ?? project.slides[0];
  const selected = current?.blocks.find((b) => b.id === selectedId) ?? null;
  const commit = useCallback((next: Project | ((p: Project) => Project)) => { setProject((p) => { const value = typeof next === "function" ? next(p) : next; setPast((h) => [...h.slice(-49), clone(p)]); setFuture([]); return value; }); }, []);
  const updateCurrent = useCallback((fn: (s: Slide) => Slide) => commit((p) => ({ ...p, slides: p.slides.map((s) => s.id === currentId ? fn(s) : s) })), [commit, currentId]);
  const undo = useCallback(() => { setPast((h) => { const previous = h.at(-1); if (!previous) return h; setFuture((f) => [clone(project), ...f]); setProject(previous); return h.slice(0, -1); }); }, [project]);
  const redo = useCallback(() => { setFuture((f) => { const next = f[0]; if (!next) return f; setPast((h) => [...h, clone(project)]); setProject(next); return f.slice(1); }); }, [project]);

  const removeSelected = useCallback(() => { if (!selectedId) return; updateCurrent((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== selectedId) })); setSelectedId(null); }, [selectedId, updateCurrent]);
  const duplicateBlock = useCallback(() => { if (!selected || !current) return; const area = findSpace(current.blocks, selected.grid.w, selected.grid.h); if (!area) { setNotice("Нет свободного места для копии"); return; } const copy = { ...clone(selected), id: crypto.randomUUID(), grid: area }; updateCurrent((s) => ({ ...s, blocks: [...s.blocks, copy] })); setSelectedId(copy.id); }, [selected, current, updateCurrent]);
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
  const addBlock = (type: BlockType) => { if (!current) return; const block = createBlock(type); const area = findSpace(current.blocks, block.grid.w, block.grid.h) ?? findSpace(current.blocks, Math.min(3, block.grid.w), Math.min(2, block.grid.h)); if (!area) { setNotice("На слайде нет свободного места"); return; } block.grid = area; updateCurrent((s) => ({ ...s, blocks: [...s.blocks, block] })); setSelectedId(block.id); setAddBlockOpen(false); };
  const addSlide = (name: keyof typeof presets) => { const id = crypto.randomUUID(); const blocks = clone(presets[name]).map((b) => ({ ...createBlock((b.type ?? "text") as BlockType), ...b, id: crypto.randomUUID() })) as Block[]; const next = { id, order: project.slides.length, title: String(name), background: "#FFFFFF", blocks }; commit((p) => ({ ...p, slides: [...p.slides, next] })); setCurrentId(id); setSelectedId(null); setPresetOpen(false); };
  const duplicateSlide = (id: string) => { const source = project.slides.find((s) => s.id === id); if (!source) return; const copy = { ...clone(source), id: crypto.randomUUID(), title: `${source.title} — копия`, blocks: source.blocks.map((b) => ({ ...b, id: crypto.randomUUID() })) }; commit((p) => ({ ...p, slides: [...p.slides, copy].map((s, i) => ({ ...s, order: i })) })); setCurrentId(copy.id); };
  const deleteSlide = (id: string) => { if (project.slides.length === 1) { setNotice("В презентации должен остаться один слайд"); return; } const left = project.slides.filter((s) => s.id !== id); commit({ ...project, slides: left.map((s, i) => ({ ...s, order: i })) }); if (currentId === id) setCurrentId(left[0].id); };
  const reorder = (targetId: string) => { if (!dragSlideId || dragSlideId === targetId) return; const list = [...project.slides]; const from = list.findIndex((s) => s.id === dragSlideId); const to = list.findIndex((s) => s.id === targetId); const [moved] = list.splice(from, 1); list.splice(to, 0, moved); commit({ ...project, slides: list.map((s, i) => ({ ...s, order: i })) }); setDragSlideId(null); };
  const upload = (e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => patchSelectedContent({ src: String(reader.result) }); reader.readAsDataURL(file); };
  const exportPresentation = () => { downloadJson(normalizeProject(project), `${project.title.toLowerCase().replaceAll(" ", "-")}.presentation.json`); setNotice("Структура презентации экспортирована"); };

  if (!ready || !current) return <div className="app-loading"><span />Загружаем презентацию…</div>;
  return <main className="editor-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">D</span><input aria-label="Название проекта" value={project.title} onChange={(e) => commit({ ...project, title: e.target.value })} /></div><div className="save-state">{notice || "Автосохранение включено"}</div><div className="top-actions"><button className="icon-button" onClick={undo} disabled={!past.length} aria-label="Отменить">↶</button><button className="icon-button" onClick={redo} disabled={!future.length} aria-label="Повторить">↷</button><div className="segmented"><button className={!preview ? "active" : ""} onClick={() => setPreview(false)}>Редактор</button><button className={preview ? "active" : ""} onClick={() => { setPreview(true); setSelectedId(null); }}>Превью</button></div><button className="primary" onClick={exportPresentation}>Экспорт <span>↓</span></button></div></header>
    <div className="workspace">
      <aside className="slides-panel"><div className="panel-title"><span>Слайды</span><small>{project.slides.length}</small></div><div className="slide-list">{project.slides.map((s, i) => <div key={s.id} className={`thumbnail-row ${s.id === current.id ? "active" : ""}`} draggable tabIndex={0} role="button" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setCurrentId(s.id); setSelectedId(null); } }} onDragStart={() => setDragSlideId(s.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(s.id)} onClick={() => { setCurrentId(s.id); setSelectedId(null); }}><span className="slide-number">{String(i + 1).padStart(2, "0")}</span><div className="thumbnail"><SlideCanvas slide={s} selectedId={null} editingId={null} preview onSelect={() => {}} onEdit={() => {}} onMoveResize={() => {}} onContent={() => {}} /></div><div className="thumb-actions"><button onClick={(e) => { e.stopPropagation(); duplicateSlide(s.id); }} title="Дублировать">⧉</button><button onClick={(e) => { e.stopPropagation(); deleteSlide(s.id); }} title="Удалить">×</button></div></div>)}</div><div className="add-wrap"><button className="add-slide" onClick={() => setPresetOpen(!presetOpen)}>＋ Добавить слайд</button>{presetOpen && <div className="popover presets"><strong>Выберите раскладку</strong>{Object.keys(presets).map((p) => <button key={p} onClick={() => addSlide(p as keyof typeof presets)}><span className="preset-icon" />{p}</button>)}</div>}</div></aside>
      <section className="canvas-area"><div className="canvas-toolbar"><span>Слайд {current.order + 1}</span><span>16:9 · 12 × 8</span></div><div className="canvas-stage"><SlideCanvas slide={current} selectedId={selectedId} editingId={editingId} preview={preview} onSelect={(id) => { setSelectedId(id); if (!id) setEditingId(null); }} onEdit={setEditingId} onMoveResize={(id, area) => updateCurrent((s) => ({ ...s, blocks: s.blocks.map((b) => b.id === id ? { ...b, grid: area } : b) }))} onContent={(id, content) => updateCurrent((s) => ({ ...s, blocks: s.blocks.map((b) => b.id === id ? { ...b, content } : b) }))} /></div>{!preview && <div className="canvas-actions"><button className="primary add-block" onClick={() => setAddBlockOpen(!addBlockOpen)}>＋ Добавить блок</button>{addBlockOpen && <div className="popover blocks"><div className="menu-label">Добавить блок</div>{(["text", "metric", "mockup", "image", "table", "chart", "divider"] as BlockType[]).map((type) => <button key={type} onClick={() => addBlock(type)}><span>{({ text: "T", metric: "%", mockup: "▣", image: "▧", table: "▦", chart: "▥", divider: "—" } as Record<string, string>)[type]}</span>{({ text: "Текст", metric: "Метрика", mockup: "Мокап", image: "Изображение", table: "Таблица", chart: "График", divider: "Разделитель" } as Record<string, string>)[type]}</button>)}</div>}</div>}</section>
      <aside className="inspector"><div className="panel-title"><span>{selected ? "Настройки блока" : "Настройки слайда"}</span>{selected && <small>{selected.type}</small>}</div>{selected ? <BlockInspector block={selected} patch={patchSelectedContent} upload={upload} duplicate={duplicateBlock} remove={removeSelected} /> : <div className="inspector-body"><Field label="Фон"><input type="color" value={current.background} onChange={(e) => updateCurrent((s) => ({ ...s, background: e.target.value }))} /><input value={current.background} onChange={(e) => updateCurrent((s) => ({ ...s, background: e.target.value }))} /></Field><Field label="Тема"><select disabled><option>Demo Default</option></select></Field><Field label="Сетка"><div className="read-only">12 колонок × 8 строк</div></Field><div className="tip"><strong>Быстрый старт</strong><p>Добавьте блок или дважды нажмите на текст, чтобы отредактировать его.</p></div></div>}</aside>
    </div>
    <div className="mobile-warning">Редактор презентаций лучше работает на экране шириной от 1280 px.</div>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span><div>{children}</div></label>; }

function BlockInspector({ block, patch, upload, duplicate, remove }: { block: Block; patch: (p: Record<string, unknown>) => void; upload: (e: ChangeEvent<HTMLInputElement>) => void; duplicate: () => void; remove: () => void }) {
  const c = block.content;
  return <div className="inspector-body"><div className="position-grid"><Field label="X"><input value={block.grid.x + 1} readOnly /></Field><Field label="Y"><input value={block.grid.y + 1} readOnly /></Field><Field label="Ширина"><input value={block.grid.w} readOnly /></Field><Field label="Высота"><input value={block.grid.h} readOnly /></Field></div>
    {block.type === "text" && <><Field label="Вариант"><select value={String(c.variant)} onChange={(e) => patch({ variant: e.target.value })}>{["heading", "subheading", "body", "insight"].map((x) => <option key={x}>{x}</option>)}</select></Field><Field label="Текст"><textarea rows={7} value={String(c.text)} onChange={(e) => patch({ text: e.target.value })} /></Field></>}
    {block.type === "metric" && <><Field label="Значение"><input value={String(c.value)} onChange={(e) => patch({ value: e.target.value })} /></Field><Field label="Подпись"><input value={String(c.label)} onChange={(e) => patch({ label: e.target.value })} /></Field><Field label="Сравнение"><input value={String(c.comparison)} onChange={(e) => patch({ comparison: e.target.value })} /></Field><Field label="Комментарий"><textarea rows={3} value={String(c.detail)} onChange={(e) => patch({ detail: e.target.value })} /></Field></>}
    {(block.type === "image" || block.type === "mockup") && <><Field label="Скриншот"><label className="upload-button">{c.src ? "Заменить" : "Загрузить"}<input type="file" accept="image/*" onChange={upload} /></label></Field><Field label="Вписывание"><select value={String(c.fit)} onChange={(e) => patch({ fit: e.target.value })}><option value="cover">Cover</option><option value="contain">Contain</option></select></Field></>}
    {block.type === "image" && <Field label="Выравнивание"><select value={String(c.align)} onChange={(e) => patch({ align: e.target.value })}>{["top", "center", "bottom"].map((x) => <option key={x}>{x}</option>)}</select></Field>}
    {block.type === "mockup" && <><Field label="Устройство"><select value={String(c.preset)} onChange={(e) => patch({ preset: e.target.value })}>{["Browser", "Desktop", "Phone", "Two phones", "Before / After"].map((x) => <option key={x}>{x}</option>)}</select></Field><Field label="Фон"><input type="color" value={String(c.background)} onChange={(e) => patch({ background: e.target.value })} /><input value={String(c.background)} onChange={(e) => patch({ background: e.target.value })} /></Field><Field label={`Отступ · ${String(c.padding)} px`}><input type="range" min="0" max="40" value={Number(c.padding)} onChange={(e) => patch({ padding: Number(e.target.value) })} /></Field><Field label="Аннотации"><div className="annotation-actions">{["Arrow", "Highlight", "Label"].map((type) => <button key={type} onClick={() => patch({ annotations: [...((c.annotations as unknown[]) ?? []), { type, label: "Важно" }].slice(-3) })}>＋ {type}</button>)}</div></Field></>}
    {block.type === "chart" && <><Field label="Тип"><select value={String(c.chartType)} onChange={(e) => patch({ chartType: e.target.value })}><option>Bar</option><option>Line</option></select></Field><Field label="Данные"><textarea rows={7} value={(c.points as Array<{ label: string; value: number }>).map((p) => `${p.label} | ${p.value}`).join("\n")} onChange={(e) => patch({ points: e.target.value.split("\n").slice(0, 30).map((line) => { const [label, value] = line.split("|"); return { label: label?.trim() || "—", value: Number(value) || 0 }; }) })} /></Field></>}
    {block.type === "table" && <><Field label="Строки"><div className="stepper"><button onClick={() => patch({ rows: (c.rows as string[][]).slice(0, -1) })} disabled={(c.rows as string[][]).length <= 1}>−</button><span>{(c.rows as string[][]).length}</span><button onClick={() => { const rows = c.rows as string[][]; patch({ rows: [...rows, Array(rows[0]?.length || 2).fill("")] .slice(0, 30) }); }}>＋</button></div></Field><p className="helper">Дважды нажмите на таблицу и редактируйте ячейки прямо на слайде.</p></>}
    {block.type === "divider" && <><Field label="Вариант"><select value={String(c.variant)} onChange={(e) => patch({ variant: e.target.value })}><option value="label">Section label</option><option value="line">Divider line</option></select></Field>{c.variant === "label" && <Field label="Подпись"><input value={String(c.label)} onChange={(e) => patch({ label: e.target.value })} /></Field>}</>}
    <div className="inspector-actions"><button onClick={duplicate}>⧉ Дублировать</button><button className="danger" onClick={remove}>Удалить</button></div></div>;
}
