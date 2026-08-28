import type PptxGenJS from "pptxgenjs";
import type { Block, GridArea, PresentationSettings, Project, Slide } from "../domain";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";
const toInches = (value: number) => value / 90;
const hex = (value: unknown, fallback = "FFFFFF") => { const match = String(value ?? "").match(/^#?([\dA-F]{6})$/i); return match?.[1].toUpperCase() ?? fallback; };
const plainText = (value: unknown) => String(value ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").trim();
const safeName = (value: string) => value.trim().replace(/[\\/:*?"<>|]+/g, "-") || "Presentation";

function gridMetrics(settings: PresentationSettings) {
  const { columns, rows, gap } = settings.grid; const availableW = 1200 - settings.padding.left - settings.padding.right; const availableH = 675 - settings.padding.top - settings.padding.bottom;
  const adaptiveW = (availableW - gap * (columns - 1)) / columns; const adaptiveH = (availableH - gap * (rows - 1)) / rows; const cellW = settings.grid.cellRatio === "square" ? Math.min(adaptiveW, adaptiveH) : adaptiveW; const cellH = settings.grid.cellRatio === "square" ? cellW : adaptiveH;
  const gridW = cellW * columns + gap * (columns - 1); const gridH = cellH * rows + gap * (rows - 1);
  return { left: settings.padding.left + (availableW - gridW) / 2, top: settings.padding.top + (availableH - gridH) / 2, cellW, cellH, gap };
}

function frame(area: GridArea, settings: PresentationSettings) {
  const metrics = gridMetrics(settings); return { x: toInches(metrics.left + area.x * (metrics.cellW + metrics.gap)), y: toInches(metrics.top + area.y * (metrics.cellH + metrics.gap)), w: toInches(area.w * metrics.cellW + (area.w - 1) * metrics.gap), h: toInches(area.h * metrics.cellH + (area.h - 1) * metrics.gap) };
}

async function imageData(source: unknown) {
  const src = String(source ?? ""); if (!src) return ""; if (src.startsWith("data:")) return src;
  const response = await fetch(src); if (!response.ok) return ""; const blob = await response.blob();
  return await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? "")); reader.onerror = () => resolve(""); reader.readAsDataURL(blob); });
}

const deviceAssets: Record<string, Record<string, string>> = {
  "iPhone 17": { White: "/device-frames/iphone-17-white.png", Black: "/device-frames/iphone-17-black.png", Pink: "/device-frames/iphone-17-pink.png" },
  Android: { White: "/device-frames/android-white.png", Black: "/device-frames/android-black.png" },
  "MacBook Air": { Silver: "/device-frames/macbook-air-silver.png" },
};

type GradientStop = [number, string];

function linearGradient(context: CanvasRenderingContext2D, width: number, height: number, angle: number, stops: GradientStop[]) {
  const radians = angle * Math.PI / 180; const dx = Math.sin(radians); const dy = -Math.cos(radians); const half = Math.abs(dx) * width / 2 + Math.abs(dy) * height / 2; const cx = width / 2; const cy = height / 2;
  const gradient = context.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half); stops.forEach(([offset, color]) => gradient.addColorStop(offset, color)); context.fillStyle = gradient; context.fillRect(0, 0, width, height);
}

function radialGradient(context: CanvasRenderingContext2D, width: number, height: number, x: number, y: number, stops: GradientStop[]) {
  const cx = width * x; const cy = height * y; const radius = Math.max(Math.hypot(cx, cy), Math.hypot(width - cx, cy), Math.hypot(cx, height - cy), Math.hypot(width - cx, height - cy));
  const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius); stops.forEach(([offset, color]) => gradient.addColorStop(offset, color)); context.fillStyle = gradient; context.fillRect(0, 0, width, height);
}

function gradientBackgroundData(preset: string) {
  const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 900; const context = canvas.getContext("2d"); if (!context) return ""; const { width, height } = canvas;
  if (preset === "wb-violet") { context.fillStyle = "#F8F9FF"; context.fillRect(0, 0, width, height); radialGradient(context, width, height, .16, .18, [[0, "#D7C9FF"], [.14, "#D7C9FF"], [.38, "rgba(215,201,255,0)"], [1, "rgba(215,201,255,0)"]]); radialGradient(context, width, height, .86, .78, [[0, "#B9ECFF"], [.16, "#B9ECFF"], [.42, "rgba(185,236,255,0)"], [1, "rgba(185,236,255,0)"]]); }
  else if (preset === "wb-warm") { context.fillStyle = "#FFFDF9"; context.fillRect(0, 0, width, height); radialGradient(context, width, height, .18, .76, [[0, "#FFE4C2"], [.15, "#FFE4C2"], [.42, "rgba(255,228,194,0)"], [1, "rgba(255,228,194,0)"]]); radialGradient(context, width, height, .84, .2, [[0, "#F2D9FF"], [.14, "#F2D9FF"], [.38, "rgba(242,217,255,0)"], [1, "rgba(242,217,255,0)"]]); }
  else if (preset === "night") { radialGradient(context, width, height, .3, .25, [[0, "#2C405E"], [.48, "#10141D"], [1, "#07090D"]]); }
  else if (preset === "mesh") { context.fillStyle = "#E7E8FF"; context.fillRect(0, 0, width, height); radialGradient(context, width, height, .18, .22, [[0, "#81D4FA"], [.18, "#81D4FA"], [.42, "rgba(129,212,250,0)"], [1, "rgba(129,212,250,0)"]]); radialGradient(context, width, height, .78, .28, [[0, "#C6FFDD"], [.16, "#C6FFDD"], [.4, "rgba(198,255,221,0)"], [1, "rgba(198,255,221,0)"]]); radialGradient(context, width, height, .52, .82, [[0, "#F8B4D9"], [.2, "#F8B4D9"], [.48, "rgba(248,180,217,0)"], [1, "rgba(248,180,217,0)"]]); }
  else if (preset === "soft-blue") linearGradient(context, width, height, 135, [[0, "#CFE8FF"], [.52, "#D8F3E7"], [1, "#FBF6DF"]]);
  else if (preset === "paper") linearGradient(context, width, height, 135, [[0, "#F4F1EA"], [1, "#D7D3CA"]]);
  else if (preset === "sunset") linearGradient(context, width, height, 145, [[0, "#F6AE72"], [.46, "#D96F82"], [1, "#5F5AA8"]]);
  else if (preset === "forest") linearGradient(context, width, height, 145, [[0, "#B8D6B0"], [.48, "#4D8065"], [1, "#173E37"]]);
  else linearGradient(context, width, height, 118, [[0, "#BCEBFF"], [.32, "#DFF5FF"], [.72, "#F7FBFF"], [1, "#FFFFFF"]]);
  return canvas.toDataURL("image/png");
}

async function addPageBackground(target: PptxGenJS.Slide, page: Slide) {
  if (page.backgroundMode === "None") { target.background = { color: "FFFFFF", transparency: 100 }; return; }
  if ((page.backgroundStyle ?? "Solid") === "Solid") { target.background = { color: hex(page.background) }; return; }
  const uploaded = page.backgroundImage ? await imageData(page.backgroundImage) : ""; const data = uploaded || gradientBackgroundData(page.backgroundPreset ?? "wb-blue");
  if (data) target.addImage({ data, x: 0, y: 0, w: 13.333, h: 7.5 }); else target.background = { color: "F7FBFF" };
}

async function addBlock(pptx: PptxGenJS, target: PptxGenJS.Slide, block: Block, settings: PresentationSettings) {
  const box = frame(block.grid, settings); const content = block.content; const fill = { color: "F5F7F8" }; const line = { color: "E3E5E8", transparency: 35 }; const shape = settings.blockRadius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
  if (!(["text", "divider", "mockup"] as Block["type"][]).includes(block.type)) target.addShape(shape, { ...box, fill, line });
  if (block.type === "text") {
    const variant = String(content.variant ?? "body"); const fontSize = variant === "heading" ? Math.max(22, Math.min(40, box.h * 11)) : variant === "subheading" ? 24 : 15;
    if (variant === "insight") target.addShape(shape, { ...box, fill: { color: "EEF4FD" }, line: { color: "5B4AB4", width: 2 } });
    target.addText(plainText(content.html ?? content.text), { ...box, margin: 0.16, fontFace: "Inter", fontSize, bold: variant === "heading" || variant === "subheading", color: "1C2228", valign: variant === "heading" ? "middle" : "top", breakLine: false, fit: "shrink" }); return;
  }
  if (block.type === "metric") {
    target.addText(String(content.value ?? ""), { x: box.x + .18, y: box.y + .18, w: box.w - .36, h: Math.max(.36, box.h * .48), margin: 0, fontFace: "Inter", fontSize: Math.max(20, Math.min(36, box.h * 13)), bold: true, color: "5B4AB4", fit: "shrink" });
    target.addText(`${plainText(content.label)}\n${plainText(content.comparison)}`, { x: box.x + .18, y: box.y + box.h * .54, w: box.w - .36, h: box.h * .36, margin: 0, fontFace: "Inter", fontSize: 11, bold: true, color: "1C2228", fit: "shrink" }); return;
  }
  if (block.type === "image") { const data = await imageData(content.src); if (data) target.addImage({ data, ...box }); else target.addText("Изображение", { ...box, margin: 0, align: "center", valign: "middle", color: "7B828A", fontSize: 13 }); return; }
  if (block.type === "mockup") {
    const transparent = String(content.backgroundMode ?? "Image") === "None"; if (!transparent) target.addShape(shape, { ...box, fill: { color: String(content.backgroundStyle) === "Solid" ? hex(content.background, "EEF0F3") : "EAF7FF" }, line: { transparency: 100 } });
    const model = String(content.deviceModel ?? "iPhone 17"); const color = String(content.deviceColor ?? "Black"); const laptop = model === "MacBook Air"; const deviceH = laptop ? Math.min(box.h * .74, box.w * .62) : box.h * .84; const deviceW = laptop ? deviceH * 1.65 : deviceH * .484; const dx = box.x + (box.w - deviceW) / 2 + toInches(Number(content.horizontal ?? 0)); const dy = box.y + (box.h - deviceH) / 2 + toInches(Number(content.vertical ?? 0)); const scale = Number(content.scale ?? 90) / 90; const imageBox = { x: dx + deviceW * (1 - scale) / 2, y: dy + deviceH * (1 - scale) / 2, w: deviceW * scale, h: deviceH * scale };
    const screen = await imageData(content.src); if (screen) target.addImage({ data: screen, ...imageBox, transparency: 0 }); const frameData = await imageData(deviceAssets[model]?.[color] ?? deviceAssets[model]?.[Object.keys(deviceAssets[model] ?? {})[0]]); if (frameData) target.addImage({ data: frameData, ...imageBox, transparency: 0 }); return;
  }
  if (block.type === "table") { const rows = (content.rows as string[][]) ?? []; target.addTable(rows.map((row) => row.map((text) => ({ text: String(text) }))), { ...box, border: { color: "DDE1E5", pt: 1 }, fill: { color: "FFFFFF" }, color: "1C2228", fontFace: "Inter", fontSize: 10, margin: .06 }); return; }
  if (block.type === "chart") {
    const points = (content.points as Array<{ label: string; value: number }>) ?? []; const max = Math.max(1, ...points.map((point) => Number(point.value))); const gap = box.w * .05; const barW = (box.w - gap * (points.length + 1)) / Math.max(points.length, 1);
    points.forEach((point, index) => { const h = box.h * .68 * Number(point.value) / max; const x = box.x + gap + index * (barW + gap); target.addShape(pptx.ShapeType.rect, { x, y: box.y + box.h * .78 - h, w: barW, h, fill: { color: "5B4AB4" }, line: { transparency: 100 } }); target.addText(String(point.label), { x, y: box.y + box.h * .8, w: barW, h: box.h * .14, margin: 0, align: "center", fontSize: 8, color: "68717A" }); }); return;
  }
  if (block.type === "divider") { if (String(content.variant) === "line") target.addShape(pptx.ShapeType.line, { x: box.x, y: box.y + box.h / 2, w: box.w, h: 0, line: { color: "BFC5CB", width: 1 } }); else target.addText(plainText(content.label), { ...box, margin: .06, fontFace: "Inter", fontSize: 10, bold: true, color: "5B4AB4", valign: "middle" }); }
}

export async function buildPptx(project: Project) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.author = "Demo Slides"; pptx.company = "WB"; pptx.subject = project.title; pptx.title = project.title; pptx.theme = { headFontFace: "Inter", bodyFontFace: "Inter" };
  for (const page of project.slides) { const target = pptx.addSlide(); await addPageBackground(target, page); for (const block of page.blocks) await addBlock(pptx, target, block, project.presentationSettings); }
  const output = await pptx.write({ outputType: "blob", compression: true }); return output instanceof Blob ? output : new Blob([output as BlobPart], { type: PPTX_MIME });
}

export async function downloadPptx(project: Project) {
  const blob = await buildPptx(project); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${safeName(project.title)}.pptx`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 500); return blob;
}

export async function uploadToGoogleSlides(project: Project, accessToken: string) {
  const presentation = await buildPptx(project); const boundary = `demo_slides_${crypto.randomUUID()}`; const metadata = { name: safeName(project.title), mimeType: GOOGLE_SLIDES_MIME };
  const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${PPTX_MIME}\r\n\r\n`, presentation, `\r\n--${boundary}--`], { type: `multipart/related; boundary=${boundary}` });
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body });
  if (!response.ok) throw new Error(`Google Drive: ${response.status}`); return await response.json() as { id: string; name: string; webViewLink?: string };
}
