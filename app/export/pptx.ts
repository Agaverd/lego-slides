import type PptxGenJS from "pptxgenjs";
import { getMetricVariant, type Block, type GridArea, type PresentationSettings, type Project, type Slide } from "../domain";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";
const toInches = (value: number) => value / 90;
const toPoints = (value: number) => value * 72 / 90;
const hex = (value: unknown, fallback = "FFFFFF") => { const match = String(value ?? "").match(/^#?([\dA-F]{6})$/i); return match?.[1].toUpperCase() ?? fallback; };
const plainText = (value: unknown) => String(value ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p|li)>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\n{3,}/g, "\n\n").trim();
const safeName = (value: string) => value.trim().replace(/[\\/:*?"<>|]+/g, "-") || "Presentation";

type TextVariant = "heading" | "subheading" | "body" | "insight";

const textStyles: Record<TextVariant, { fontSize: number; bold: boolean; valign: "top" | "middle" }> = {
  heading: { fontSize: toPoints(52), bold: true, valign: "middle" },
  subheading: { fontSize: toPoints(32), bold: true, valign: "top" },
  body: { fontSize: toPoints(18), bold: false, valign: "top" },
  insight: { fontSize: toPoints(20), bold: true, valign: "top" },
};

function textVariant(value: unknown): TextVariant {
  const variant = String(value ?? "body");
  return variant === "heading" || variant === "subheading" || variant === "insight" ? variant : "body";
}

function richTextAlign(value: unknown): "left" | "center" | "right" {
  const html = String(value ?? "");
  const match = html.match(/text-align\s*:\s*(left|center|right)/i) ?? html.match(/align=["']?(left|center|right)/i);
  if (match?.[1]) return match[1].toLowerCase() as "left" | "center" | "right";
  return /<center(?:\s|>)/i.test(html) ? "center" : "left";
}

function richTextFontSize(value: unknown, fallback: number) {
  const match = String(value ?? "").match(/font-size\s*:\s*([\d.]+)\s*(px|pt)/i);
  if (!match) return fallback;
  const size = Number(match[1]) * (match[2].toLowerCase() === "px" ? 72 / 90 : 1);
  return Number.isFinite(size) ? Math.max(6, Math.min(96, size)) : fallback;
}

function richTextRuns(value: unknown, inheritedBold: boolean): PptxGenJS.TextProps[] {
  const html = String(value ?? ""); if (!/<[a-z][\s\S]*>/i.test(html) || typeof DOMParser === "undefined") return [{ text: plainText(html), options: { bold: inheritedBold } }];
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild; const runs: PptxGenJS.TextProps[] = [];
  const push = (text: string, bold: boolean, italic: boolean, underline: boolean) => { if (!text) return; const options = { bold: inheritedBold || bold, italic, underline: underline ? { style: "sng" as const } : undefined }; const previous = runs.at(-1); if (previous && JSON.stringify(previous.options) === JSON.stringify(options)) previous.text = `${previous.text ?? ""}${text}`; else runs.push({ text, options }); };
  const newline = () => { const last = runs.at(-1); if (last && !String(last.text ?? "").endsWith("\n")) push("\n", false, false, false); };
  const walk = (node: Node, state = { bold: false, italic: false, underline: false }) => {
    if (node.nodeType === Node.TEXT_NODE) { push(node.textContent ?? "", state.bold, state.italic, state.underline); return; }
    if (!(node instanceof HTMLElement)) return; const tag = node.tagName.toLowerCase(); const next = { bold: state.bold || tag === "b" || tag === "strong", italic: state.italic || tag === "i" || tag === "em", underline: state.underline || tag === "u" };
    if (tag === "br") { newline(); return; } if (tag === "li") push("• ", next.bold, next.italic, next.underline);
    node.childNodes.forEach((child) => walk(child, next)); if (["div", "p", "li"].includes(tag)) newline();
  };
  root?.childNodes.forEach((node) => walk(node)); if (runs.at(-1)?.text === "\n") runs.pop(); return runs.length ? runs : [{ text: plainText(html), options: { bold: inheritedBold } }];
}

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
  if ((page.backgroundStyle ?? "Solid") === "Solid") { target.background = { color: hex(page.background) }; return; }
  const uploaded = page.backgroundImage ? await imageData(page.backgroundImage) : ""; const data = uploaded || gradientBackgroundData(page.backgroundPreset ?? "wb-blue");
  if (data) target.addImage({ data, x: 0, y: 0, w: 13.333, h: 7.5 }); else target.background = { color: "F7FBFF" };
}

async function addBlock(pptx: PptxGenJS, target: PptxGenJS.Slide, block: Block, settings: PresentationSettings) {
  const box = frame(block.grid, settings); const content = block.content; const fill = { color: "F5F7F8" }; const line = { color: "E3E5E8", transparency: 35 }; const shape = settings.blockRadius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
  if (!(["text", "divider", "mockup"] as Block["type"][]).includes(block.type)) target.addShape(shape, { ...box, fill, line });
  if (block.type === "text") {
    const variant = textVariant(content.variant); const typography = textStyles[variant]; const html = content.html ?? content.text;
    const explicitSize = Number(content.fontSize); const fontSize = Number.isFinite(explicitSize) ? Math.max(6, Math.min(96, toPoints(explicitSize))) : richTextFontSize(html, typography.fontSize);
    const insetX = Math.min(toInches(28), box.w * .22); const insetTop = variant === "insight" ? box.h * .16 : Math.min(toInches(28), box.h * .3); const insetBottom = Math.min(toInches(28), box.h * .3); const textBox = { x: box.x + insetX, y: box.y + insetTop, w: Math.max(.05, box.w - insetX * 2), h: Math.max(.05, box.h - insetTop - insetBottom) };
    if (content.backgroundEnabled) target.addShape(shape, { ...box, fill: { color: hex(content.backgroundColor) }, line: { transparency: 100 } });
    else if (variant === "insight") target.addShape(shape, { ...box, fill: { color: "EEF4FD" }, line: { color: "5B4AB4", width: 2 } });
    target.addText(richTextRuns(html, typography.bold), { ...textBox, margin: 0, fontFace: String(content.fontFamily ?? "Inter"), fontSize, color: hex(content.textColor, "000000"), align: richTextAlign(html), valign: typography.valign, breakLine: false, fit: "shrink", ...(variant === "heading" ? { charSpacing: -1.75 } : {}) }); return;
  }
  if (block.type === "metric") {
    const metricVariant = getMetricVariant(block.grid); const compact = block.grid.w <= 2 || block.grid.h <= 2; const padding = compact ? .08 : .18; const metricFontSize = compact ? Math.max(12, Math.min(22, box.h * 10)) : Math.max(20, Math.min(36, box.h * 13));
    if (metricVariant === "square") { target.addText(String(content.value ?? ""), { x: box.x + padding, y: box.y + padding, w: box.w - padding * 2, h: box.h - padding * 2, margin: 0, align: "center", valign: "middle", fontFace: "Inter", fontSize: metricFontSize, bold: true, color: "5B4AB4", fit: "shrink" }); return; }
    if (metricVariant === "horizontal") {
      target.addText(String(content.value ?? ""), { x: box.x + padding, y: box.y + padding, w: box.w * .54, h: box.h - padding * 2, margin: 0, valign: "middle", fontFace: "Inter", fontSize: metricFontSize, bold: true, color: "5B4AB4", fit: "shrink" });
      target.addText(plainText(content.label), { x: box.x + box.w * .56, y: box.y + padding, w: box.w * .4 - padding, h: box.h - padding * 2, margin: 0, valign: "middle", fontFace: "Inter", fontSize: compact ? 9 : 13, bold: true, color: "1C2228", fit: "shrink" }); return;
    }
    target.addText(String(content.value ?? ""), { x: box.x + padding, y: box.y + box.h * .18, w: box.w - padding * 2, h: box.h * .38, margin: 0, align: "center", valign: "middle", fontFace: "Inter", fontSize: metricFontSize, bold: true, color: "5B4AB4", fit: "shrink" });
    target.addText(plainText(content.label), { x: box.x + padding, y: box.y + box.h * .56, w: box.w - padding * 2, h: box.h * .24, margin: 0, align: "center", valign: "top", fontFace: "Inter", fontSize: compact ? 9 : 12, bold: true, color: "1C2228", fit: "shrink" }); return;
  }
  if (block.type === "image") { const data = await imageData(content.src); if (data) target.addImage({ data, ...box }); else target.addText("Изображение", { ...box, margin: 0, align: "center", valign: "middle", color: "7B828A", fontSize: 13 }); return; }
  if (block.type === "mockup") {
    const transparent = String(content.backgroundMode ?? "Image") === "None"; if (!transparent) { if (String(content.backgroundStyle) === "Solid") target.addShape(shape, { ...box, fill: { color: hex(content.background, "FFFFFF") }, line: { transparency: 100 } }); else { const uploaded = content.backgroundImage ? await imageData(content.backgroundImage) : ""; const background = uploaded || gradientBackgroundData(String(content.backgroundPreset ?? "mesh")); if (background) target.addImage({ data: background, ...box }); } }
    const model = String(content.deviceModel ?? "iPhone 17"); const color = String(content.deviceColor ?? "Black"); const laptop = model === "MacBook Air"; const scale = Math.max(.35, Math.min(1.8, Number(content.scale ?? 90) / 100)); const baseW = laptop ? box.w * .94 : box.h * .92 * (438 / 905); const baseH = laptop ? baseW * (908 / 1499) : box.h * .92; const imageBox = { x: box.x + (box.w - baseW * scale) / 2 + toInches(Number(content.horizontal ?? 0)), y: box.y + (box.h - baseH * scale) / 2 + toInches(Number(content.vertical ?? 0)), w: baseW * scale, h: baseH * scale };
    const screenInsets = laptop ? { left: .101, top: .034, width: .798, height: .854 } : model === "Android" ? { left: .041, top: .017, width: .917, height: .965 } : { left: .042, top: .016, width: .916, height: .964 }; const screenBox = { x: imageBox.x + imageBox.w * screenInsets.left, y: imageBox.y + imageBox.h * screenInsets.top, w: imageBox.w * screenInsets.width, h: imageBox.h * screenInsets.height };
    const screen = await imageData(content.src); if (screen) target.addImage({ data: screen, ...screenBox, transparency: 0 }); const frameData = await imageData(deviceAssets[model]?.[color] ?? deviceAssets[model]?.[Object.keys(deviceAssets[model] ?? {})[0]]); if (frameData) target.addImage({ data: frameData, ...imageBox, transparency: 0 }); return;
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
  for (const page of project.slides) { const target = pptx.addSlide(); await addPageBackground(target, page); for (const block of page.blocks) await addBlock(pptx, target, block, project.presentationSettings); if (project.presentationSettings.showSlideNumbers) target.addText(String(page.order + 1).padStart(2, "0"), { x: 12.65, y: 7.05, w: .42, h: .2, margin: 0, align: "right", fontFace: "Inter", fontSize: 9, bold: true, color: "6F7882" }); }
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
