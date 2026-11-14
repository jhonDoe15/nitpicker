function tableRow(cells: readonly string[], widths: readonly number[]): string {
  return `| ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join(' | ')} |`;
}

export function markdownTableLines(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string[] {
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((cells) => (cells[column] ?? '').length)),
  );
  return [
    tableRow(header, widths),
    tableRow(
      widths.map((width) => '-'.repeat(width)),
      widths,
    ),
    ...rows.map((cells) => tableRow(cells, widths)),
  ];
}
