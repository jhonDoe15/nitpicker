import { enclosingOpen } from './kotlin-scan.mts';

export type BodyKind = 'type' | 'interface' | 'other';

const TYPE_KEYWORD = /(?<![\w.:])(?:class|object|interface)\b/u;
const INTERFACE_KEYWORD = /(?<![\w.:])interface\b/u;
const CLASS_KEYWORD = /(?<![\w.:])(?:class|object)\b/u;
const JOINERS = ',:{';
const GROUP_DEPTH: Readonly<Record<string, number>> = { ')': 1, ']': 1, '(': -1, '[': -1 };

function joinsLines(code: string, newline: number): boolean {
  const before = code.slice(0, newline).trimEnd().at(-1) ?? '';
  const after = code.slice(newline).trimStart();
  return JOINERS.includes(before) || (after !== '' && ':,{'.includes(after.charAt(0)));
}

function headerStart(code: string, open: number): number {
  let depth = 0;
  for (const at of Array.from({ length: open }, (_, step) => open - 1 - step)) {
    const character = code.charAt(at);
    depth += GROUP_DEPTH[character] ?? 0;
    const boundary =
      depth <= 0 && (';{}'.includes(character) || (character === '\n' && !joinsLines(code, at)));
    if (boundary) {
      return at + 1;
    }
  }
  return 0;
}

export function headerOf(code: string, open: number): string {
  return code.slice(headerStart(code, open), open);
}

export function kindOfBody(code: string, open: number): BodyKind {
  const header = headerOf(code, open);
  if (!TYPE_KEYWORD.test(header)) {
    return 'other';
  }
  return INTERFACE_KEYWORD.test(header) && !CLASS_KEYWORD.test(header) ? 'interface' : 'type';
}

export function enclosingBodyKind(code: string, offset: number): BodyKind | undefined {
  const open = enclosingOpen(code, offset);
  return open === -1 ? undefined : kindOfBody(code, open);
}
