export type BlockType = "text" | "metric" | "image" | "mockup" | "table" | "chart" | "divider";
export type GridArea = { x: number; y: number; w: number; h: number };

export type Block = {
  id: string;
  type: BlockType;
  grid: GridArea;
  content: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

export type Slide = {
  id: string;
  order: number;
  title: string;
  background: string;
  blocks: Block[];
};

export type Project = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  themeId: "demo-default";
  slides: Slide[];
};

export type PresentationModel = {
  title: string;
  aspectRatio: "16:9";
  theme: string;
  slides: Array<{ id: string; elements: Array<{ kind: BlockType; frame: GridArea; data: Record<string, unknown> }> }>;
};

const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function createBlock(type: BlockType, grid?: GridArea): Block {
  const content: Record<BlockType, Record<string, unknown>> = {
    text: { variant: "body", text: "Новый текстовый блок" },
    metric: { value: "+0.7%", label: "GMV", comparison: "vs control +0.2%", detail: "Рост после запуска нового ранжирования" },
    image: { src: "", fit: "cover", align: "center", alt: "Изображение" },
    mockup: { preset: "Browser", src: "", fit: "contain", background: "#EEF0F3", padding: 16, scale: 90, annotations: [] },
    table: { rows: [["Сегмент", "Значение"], ["Control", "12.4"], ["Test", "13.1"]] },
    chart: { chartType: "Bar", points: [{ label: "A", value: 10 }, { label: "B", value: 14 }, { label: "C", value: 11 }] },
    divider: { variant: "label", label: "Результаты эксперимента" },
  };
  const sizes: Record<BlockType, GridArea> = {
    text: { x: 0, y: 0, w: 6, h: 2 }, metric: { x: 0, y: 0, w: 3, h: 2 }, image: { x: 0, y: 0, w: 6, h: 4 },
    mockup: { x: 0, y: 0, w: 7, h: 5 }, table: { x: 0, y: 0, w: 8, h: 4 }, chart: { x: 0, y: 0, w: 6, h: 4 }, divider: { x: 0, y: 0, w: 12, h: 1 },
  };
  return { id: id(), type, grid: grid ?? sizes[type], content: structuredClone(content[type]) };
}

const slide = (order: number, title: string, blocks: Block[]): Slide => ({ id: id(), order, title, background: "#FFFFFF", blocks });

export function createDemoProject(): Project {
  const now = new Date().toISOString();
  return {
    id: id(), title: "Recommendations Demo", createdAt: now, updatedAt: now, themeId: "demo-default",
    slides: [
      slide(0, "Ключевые результаты", [
        { ...createBlock("text", { x: 0, y: 0, w: 12, h: 2 }), content: { variant: "heading", text: "Новое ранжирование растит ключевые метрики" } },
        { ...createBlock("metric", { x: 0, y: 2, w: 3, h: 2 }), content: { value: "+0.7%", label: "GMV", comparison: "vs control +0.2%", detail: "Устойчивый рост во всех сегментах" } },
        { ...createBlock("metric", { x: 3, y: 2, w: 3, h: 2 }), content: { value: "+1.3%", label: "CTR", comparison: "vs control +0.5%", detail: "Выше вовлечённость в рекомендации" } },
        createBlock("mockup", { x: 6, y: 2, w: 6, h: 6 }),
        { ...createBlock("text", { x: 0, y: 4, w: 6, h: 4 }), content: { variant: "insight", text: "Эффект сохраняется после двух недель эксперимента и не снижает конверсию в заказ." } },
      ]),
      slide(1, "До и после", [{ ...createBlock("mockup", { x: 0, y: 0, w: 12, h: 8 }), content: { ...createBlock("mockup").content, preset: "Before / After" } }]),
      slide(2, "Динамика", [
        { ...createBlock("chart", { x: 0, y: 0, w: 8, h: 8 }), content: { chartType: "Line", points: [{ label: "W1", value: 10 }, { label: "W2", value: 13 }, { label: "W3", value: 12 }, { label: "W4", value: 16 }] } },
        { ...createBlock("text", { x: 8, y: 0, w: 4, h: 8 }), content: { variant: "insight", text: "Рост ускоряется после первой недели и остаётся стабильным к концу эксперимента." } },
      ]),
    ],
  };
}

export const presets = {
  Blank: [],
  Hero: [{ type: "text", grid: { x: 1, y: 2, w: 10, h: 4 }, content: { variant: "heading", text: "Заголовок презентации" } }],
  "Metric + Mockup": [createBlock("metric", { x: 0, y: 0, w: 4, h: 3 }), createBlock("mockup", { x: 4, y: 0, w: 8, h: 8 })],
  "2 Metrics + Mockup": [createBlock("metric", { x: 0, y: 0, w: 3, h: 2 }), createBlock("metric", { x: 3, y: 0, w: 3, h: 2 }), createBlock("mockup", { x: 6, y: 0, w: 6, h: 8 })],
  "Before / After": [{ ...createBlock("mockup", { x: 0, y: 0, w: 12, h: 8 }), content: { ...createBlock("mockup").content, preset: "Before / After" } }],
  "Metrics dashboard": [createBlock("metric", { x: 0, y: 0, w: 4, h: 4 }), createBlock("metric", { x: 4, y: 0, w: 4, h: 4 }), createBlock("metric", { x: 8, y: 0, w: 4, h: 4 }), createBlock("chart", { x: 0, y: 4, w: 12, h: 4 })],
  Table: [createBlock("table", { x: 0, y: 1, w: 12, h: 6 })],
  "Chart + Insight": [createBlock("chart", { x: 0, y: 0, w: 8, h: 8 }), { ...createBlock("text", { x: 8, y: 0, w: 4, h: 8 }), content: { variant: "insight", text: "Добавьте главный вывод" } }],
} satisfies Record<string, Array<Partial<Block>>>;

export function normalizeProject(project: Project): PresentationModel {
  return { title: project.title, aspectRatio: "16:9", theme: project.themeId, slides: project.slides.map((s) => ({ id: s.id, elements: s.blocks.map((b) => ({ kind: b.type, frame: b.grid, data: b.content })) })) };
}
