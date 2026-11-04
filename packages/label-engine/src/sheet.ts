/** A4 multi-label sheets (LBL-10). Pure geometry in millimetres: no fonts, no rendering, easy to test. */

export const A4_MM = { width: 210, height: 297 } as const;

export type SheetMarks = "none" | "crop" | "border";

export interface SheetOptions {
  pageWidthMm: number;
  pageHeightMm: number;
  /** Space kept clear around the grid. Most printers cannot print closer than 4 to 5 mm to the edge. */
  marginMm: number;
  /** Space between neighbouring labels. */
  gapMm: number;
  /** "crop" ticks outside the grid for cutting plain paper, "border" a hairline box around each label, or none for sticker sheets. */
  marks: SheetMarks;
  /** Cells to skip on the first page, counted left to right then top to bottom (a partly used sticker sheet). 0 starts at the top-left. */
  startCell: number;
}

export const DEFAULT_SHEET: SheetOptions = { pageWidthMm: A4_MM.width, pageHeightMm: A4_MM.height, marginMm: 5, gapMm: 0, marks: "none", startCell: 0 };

export interface SheetGrid {
  cols: number;
  rows: number;
  perPage: number;
  /** Left edge of the first column and top edge of the first row. */
  originXMm: number;
  originYMm: number;
  gapMm: number;
}

/** How many labels fit. Floating point is rounded off so 200 mm / 40 mm is exactly 5 columns, not 4. */
export function sheetGrid(labelWmm: number, labelHmm: number, o: SheetOptions): SheetGrid {
  const fit = (room: number, size: number) => Math.max(0, Math.floor((room + o.gapMm) / (size + o.gapMm) + 1e-9));
  const cols = fit(o.pageWidthMm - 2 * o.marginMm, labelWmm);
  const rows = fit(o.pageHeightMm - 2 * o.marginMm, labelHmm);
  return { cols, rows, perPage: cols * rows, originXMm: o.marginMm, originYMm: o.marginMm, gapMm: o.gapMm };
}

export interface SheetSlot {
  /** Index into the list of labels to print (copies already expanded). */
  item: number;
  xMm: number;
  yMm: number;
}

export interface SheetLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SheetPage {
  slots: SheetSlot[];
  /** Crop ticks (marks "crop"). */
  lines: SheetLine[];
  /** Label outlines (marks "border"), one per used cell. */
  boxes: { xMm: number; yMm: number; wMm: number; hMm: number }[];
}

export interface SheetPlan {
  grid: SheetGrid;
  pages: SheetPage[];
  /** Cells left empty on the last page. */
  unusedOnLastPage: number;
  warnings: string[];
}

const TICK_MM = 3;

/** Lays `count` labels onto as many pages as it takes, honouring the start cell on the first page. */
export function planSheet(count: number, labelWmm: number, labelHmm: number, options: Partial<SheetOptions> = {}): SheetPlan {
  const o: SheetOptions = { ...DEFAULT_SHEET, ...options };
  const grid = sheetGrid(labelWmm, labelHmm, o);
  const warnings: string[] = [];
  if (grid.perPage < 1) {
    return { grid, pages: [], unusedOnLastPage: 0, warnings: ["This label is too big for the page with these margins."] };
  }
  const start = Math.min(Math.max(0, Math.floor(o.startCell)), grid.perPage - 1);
  if (o.startCell >= grid.perPage) warnings.push(`The start position is past the end of the page, so it starts at the last cell (${grid.perPage}).`);
  if (o.marginMm < 3) warnings.push("Margins under 3 mm often get cut off by the printer.");

  const pages: SheetPage[] = [];
  let next = 0;
  let first = true;
  while (next < count) {
    const page: SheetPage = { slots: [], lines: [], boxes: [] };
    for (let cell = first ? start : 0; cell < grid.perPage && next < count; cell++) {
      const col = cell % grid.cols;
      const row = Math.floor(cell / grid.cols);
      const xMm = grid.originXMm + col * (labelWmm + o.gapMm);
      const yMm = grid.originYMm + row * (labelHmm + o.gapMm);
      page.slots.push({ item: next++, xMm, yMm });
      if (o.marks === "border") page.boxes.push({ xMm, yMm, wMm: labelWmm, hMm: labelHmm });
    }
    if (o.marks === "crop") page.lines = cropMarks(grid, labelWmm, labelHmm, o);
    pages.push(page);
    first = false;
  }
  const last = pages[pages.length - 1];
  const usedOnLast = last ? last.slots.length + (pages.length === 1 ? start : 0) : 0;
  return { grid, pages, unusedOnLastPage: last ? grid.perPage - usedOnLast : 0, warnings };
}

/** Short ticks just outside the grid at every column and row edge, so a ruler or trimmer lines up even with no gap. */
function cropMarks(grid: SheetGrid, w: number, h: number, o: SheetOptions): SheetLine[] {
  const tick = Math.min(TICK_MM, o.marginMm - 0.5);
  if (tick < 1) return [];
  const lines: SheetLine[] = [];
  const left = grid.originXMm;
  const top = grid.originYMm;
  const right = left + grid.cols * w + (grid.cols - 1) * o.gapMm;
  const bottom = top + grid.rows * h + (grid.rows - 1) * o.gapMm;
  const xs: number[] = [];
  for (let c = 0; c < grid.cols; c++) xs.push(left + c * (w + o.gapMm), left + c * (w + o.gapMm) + w);
  const ys: number[] = [];
  for (let r = 0; r < grid.rows; r++) ys.push(top + r * (h + o.gapMm), top + r * (h + o.gapMm) + h);
  for (const x of new Set(xs)) {
    lines.push({ x1: x, y1: top - 0.5 - tick, x2: x, y2: top - 0.5 }, { x1: x, y1: bottom + 0.5, x2: x, y2: bottom + 0.5 + tick });
  }
  for (const y of new Set(ys)) {
    lines.push({ x1: left - 0.5 - tick, y1: y, x2: left - 0.5, y2: y }, { x1: right + 0.5, y1: y, x2: right + 0.5 + tick, y2: y });
  }
  return lines;
}

export const labelsFitOnPage = (labelWmm: number, labelHmm: number, o: Partial<SheetOptions> = {}) =>
  sheetGrid(labelWmm, labelHmm, { ...DEFAULT_SHEET, ...o }).perPage;
