import type {
  BracketPair,
  PartOptions,
  StringLiteral,
  TextPart,
} from '../../typed/unbound-types.mts';
import { escapeRegExp } from '../../typed/shared-views.mts';
const OPENERS: Readonly<Record<string, string>> = { '(': ')', '{': '}', '[': ']', '<': '>' };
const CLOSERS = new Set([')', '}', ']', '>']);
const LITERAL = /"""([\s\S]*?)"""|"((?:\\.|[^"\\\n])*)"/gu;
const TEXT_BLOCK_OPEN = 3;

function depthChange(character: string, { open, close }: BracketPair): number {
  if (character === open) {
    return 1;
  }
  return character === close ? -1 : 0;
}

export function closingIndex(text: string, start: number): number {
  const pair: BracketPair = { open: text[start] ?? '', close: OPENERS[text[start] ?? ''] };
  if (pair.close === undefined) {
    return text.length;
  }
  const brackets = new RegExp(`[${escapeRegExp(pair.open)}${escapeRegExp(pair.close)}]`, 'gu');
  brackets.lastIndex = start;
  let depth = 0;
  for (const match of text.matchAll(brackets)) {
    depth += depthChange(match[0], pair);
    if (depth === 0) {
      return match.index;
    }
  }
  return text.length;
}

function isCloser(text: string, index: number, angles: boolean): boolean {
  const character = text[index] ?? '';
  if (character === '>') {
    return angles && text[index - 1] !== '-';
  }
  return CLOSERS.has(character);
}

export function topLevelParts(
  text: string,
  separators: readonly string[],
  options: PartOptions = {},
): TextPart[] {
  const angles = options.angles !== false;
  const first: TextPart = { start: 0, text: '' };
  const parts: TextPart[] = [first];
  let depth = 0;
  for (const [index, character] of Array.from(text).entries()) {
    const opens = character in OPENERS && (angles || character !== '<');
    depth = Math.max(0, depth + (opens ? 1 : 0) - (isCloser(text, index, angles) ? 1 : 0));
    if (depth === 0 && separators.includes(character)) {
      parts.push({ start: index + 1, text: '' });
    } else {
      const last = parts.at(-1) ?? first;
      last.text += character;
    }
  }
  return parts.filter((part) => part.text.trim() !== '');
}

export function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length;
}

function blockLines(match: RegExpExecArray): StringLiteral[] {
  const lines = (match[1] ?? '').split('\n');
  return lines.map((line, index) => ({
    value: line.trim(),
    offset: match.index + TEXT_BLOCK_OPEN + lines.slice(0, index).join('\n').length + index,
    continued: false,
  }));
}

export function stringLiterals(text: string): StringLiteral[] {
  return [...text.matchAll(LITERAL)].flatMap((match) =>
    match[1] === undefined
      ? [
          {
            value: match[2] ?? '',
            offset: match.index,
            continued: text.slice(0, match.index).trimEnd().endsWith('+'),
          },
        ]
      : blockLines(match),
  );
}

function memberCharacter(character: string, depth: number): string {
  if (character === '{') {
    return depth === 0 ? '{};' : '';
  }
  if (character === '}') {
    return depth === 1 ? ';' : '';
  }
  return depth === 0 ? character : '';
}

export function memberText(body: string): string {
  let depth = 0;
  let kept = '';
  for (const character of body) {
    kept += memberCharacter(character, depth);
    depth = Math.max(0, depth + depthChange(character, { open: '{', close: '}' }));
  }
  return kept;
}
