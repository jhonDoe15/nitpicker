export type SourceComment = { text: string; line: number; block: boolean };

export type Scan = {
  readonly text: string;
  readonly chars: string[];
  readonly comments: SourceComment[];
  readonly lineStarts: readonly number[];
  readonly kotlin: boolean;
  readonly keepStrings: boolean;
};

export type MaskOptions = { kotlin?: boolean; keepStrings?: boolean };

export type Masked = { masked: string; comments: SourceComment[] };

export function createScan(text: string, options: MaskOptions = {}): Scan {
  const { kotlin = false, keepStrings = false } = options;
  const lineStarts = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    lineStarts.push(index + 1);
  }
  return { text, chars: text.split(''), comments: [], lineStarts, kotlin, keepStrings };
}

export function lineOf(scan: Scan, index: number): number {
  let low = 0;
  let high = scan.lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((scan.lineStarts[middle] ?? 0) <= index) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

export function blank(scan: Scan, from: number, to: number): void {
  for (let index = from; index < to; index += 1) {
    if (scan.chars[index] !== '\n') scan.chars[index] = ' ';
  }
}

export function addComment(
  scan: Scan,
  {
    from,
    to,
    delimiter,
    closer = '',
  }: { from: number; to: number; delimiter: string; closer?: string },
): void {
  scan.comments.push({
    text: scan.text.slice(from + delimiter.length, to - closer.length),
    line: lineOf(scan, from),
    block: closer !== '',
  });
  blank(scan, from, to);
}

export function lineComment(scan: Scan, from: number, delimiter: string): number {
  const newline = scan.text.indexOf('\n', from);
  const to = newline === -1 ? scan.text.length : newline;
  addComment(scan, { from, to, delimiter });
  return to;
}

export function finish(scan: Scan): Masked {
  return { masked: scan.chars.join(''), comments: scan.comments };
}
