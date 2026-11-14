import {
  blank,
  createScan,
  finish,
  lineComment,
  type Masked,
  type MaskOptions,
  type Scan,
} from './lines.mts';

export function maskPython(text: string, { keepStrings = false }: MaskOptions = {}): Masked {
  const scan = createScan(text, { keepStrings });
  let index = 0;
  while (index < text.length) {
    const character = text.charAt(index);
    if (character === '#') index = lineComment(scan, index, '#');
    else if (character === '"' || character === "'") index = stringLiteral(scan, index);
    else index += 1;
  }
  return finish(scan);
}

function stringLiteral(scan: Scan, from: number): number {
  const mark = scan.text.charAt(from);
  const quote = scan.text.startsWith(mark.repeat(3), from) ? mark.repeat(3) : mark;
  let index = from + quote.length;
  while (index < scan.text.length && !scan.text.startsWith(quote, index)) {
    if (quote.length === 1 && scan.text[index] === '\n') break;
    index += scan.text[index] === '\\' ? 2 : 1;
  }
  index = Math.min(index, scan.text.length);
  if (!scan.keepStrings) blank(scan, from + quote.length, index);
  return scan.text.startsWith(quote, index) ? index + quote.length : index;
}
