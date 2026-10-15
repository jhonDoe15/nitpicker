import { formatCents } from '../../money/index.js';
import type { Row } from './summarize-sales.js';
import type { Format } from './sale.js';

type Cells = { readonly product: string; readonly units: string; readonly revenue: string };

type Widths = { readonly product: number; readonly units: number; readonly revenue: number };

function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function cellsOf(row: Row): Cells {
  return {
    product: row.product,
    units: String(row.units),
    revenue: formatCents(row.revenueCents),
  };
}

function totalOf(rows: readonly Row[]): Cells {
  return cellsOf({
    product: 'Total',
    units: rows.reduce((sum, row) => sum + row.units, 0),
    revenueCents: rows.reduce((sum, row) => sum + row.revenueCents, 0),
  });
}

function alignedLine(cells: Cells, width: Widths): string {
  const product = cells.product.padEnd(width.product);
  const units = cells.units.padStart(width.units);
  const revenue = cells.revenue.padStart(width.revenue);
  return `${product}  ${units}  ${revenue}\n`;
}

function renderTable(rows: readonly Row[]): string {
  if (rows.length === 0) {
    return 'No sales found\n';
  }
  const header: Cells = { product: 'Product', units: 'Units', revenue: 'Revenue' };
  const lines: readonly Cells[] = [header, ...rows.map(cellsOf), totalOf(rows)];
  const width: Widths = {
    product: Math.max(...lines.map((cells) => cells.product.length)),
    units: Math.max(...lines.map((cells) => cells.units.length)),
    revenue: Math.max(...lines.map((cells) => cells.revenue.length)),
  };
  return lines.map((cells) => alignedLine(cells, width)).join('');
}

function renderCsv(rows: readonly Row[]): string {
  const lines: readonly string[] = rows.map((row) => {
    const cells = cellsOf(row);
    return [cells.product, cells.units, cells.revenue].map(csvField).join(',');
  });
  return ['product,units,revenue', ...lines].map((line) => `${line}\n`).join('');
}

export function renderReport(rows: readonly Row[], format: Format): string {
  switch (format) {
    case 'table':
      return renderTable(rows);
    case 'csv':
      return renderCsv(rows);
  }
}
