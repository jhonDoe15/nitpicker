import {
  addComment,
  blank,
  createScan,
  finish,
  lineComment,
  type Masked,
  type MaskOptions,
  type Scan,
} from './lines.mts';

export function maskCLike(
  text: string,
  { kotlin = false, keepStrings = false }: MaskOptions = {},
): Masked {
  const scan = createScan(text, { kotlin, keepStrings });
  scanCode(scan, 0, false);
  return finish(scan);
}

function scanCode(scan: Scan, start: number, untilBrace: boolean): number {
  let index = start;
  let depth = 0;
  while (index < scan.text.length) {
    const character = scan.text.charAt(index);
    if (untilBrace && character === '}' && depth === 0) return index + 1;
    if (untilBrace) depth += Number(character === '{') - Number(character === '}');
    index = step(scan, index);
  }
  return index;
}

function step(scan: Scan, index: number): number {
  const pair = scan.text.slice(index, index + 2);
  const character = scan.text.charAt(index);
  if (pair === '//') return lineComment(scan, index, '//');
  if (pair === '/*') return blockComment(scan, index);
  if (character === '"') return stringLiteral(scan, index);
  if (character === "'") return characterLiteral(scan, index);
  if (character === '`' && scan.kotlin) return backquotedName(scan, index);
  return index + 1;
}

function blockComment(scan: Scan, from: number): number {
  let index = from + 2;
  let depth = 1;
  while (index < scan.text.length && depth > 0) {
    const pair = scan.text.slice(index, index + 2);
    const opens = scan.kotlin && pair === '/*';
    const closes = pair === '*/';
    depth += Number(opens) - Number(closes);
    index += opens || closes ? 2 : 1;
  }
  addComment(scan, { from, to: index, delimiter: '/*', closer: depth === 0 ? '*/' : '' });
  return index;
}

function stringLiteral(scan: Scan, from: number): number {
  const triple = scan.text.startsWith('"""', from);
  const quote = triple ? '"""' : '"';
  const end = stringEnd(scan, from + quote.length, { quote, escapes: !triple });
  if (!scan.keepStrings) {
    blank(scan, from + quote.length, Math.max(from + quote.length, end - quote.length));
  }
  return end;
}

function stringEnd(
  scan: Scan,
  from: number,
  { quote, escapes }: { quote: string; escapes: boolean },
): number {
  let index = from;
  while (index < scan.text.length) {
    const character = scan.text.charAt(index);
    if (scan.text.startsWith(quote, index)) return index + quote.length;
    if (quote === '"' && character === '\n') return index;
    if (escapes && character === '\\') index += 2;
    else if (scan.kotlin && scan.text.startsWith('${', index))
      index = scanCode(scan, index + 2, true);
    else index += 1;
  }
  return index;
}

function characterLiteral(scan: Scan, from: number): number {
  const end = stringEnd(scan, from + 1, { quote: "'", escapes: true });
  if (!scan.keepStrings) blank(scan, from + 1, Math.max(from + 1, end - 1));
  return end;
}

function backquotedName(scan: Scan, from: number): number {
  const close = scan.text.indexOf('`', from + 1);
  return close === -1 ? from + 1 : close + 1;
}
