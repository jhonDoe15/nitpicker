import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import { enclosingBodyKind, kindOfBody } from '../shared/body-kind.mts';
import { closingIndex, enclosingOpen } from '../shared/kotlin-scan.mts';
import type { KotlinFound, ScannedKotlin, Span } from '../shared/kotlin-scan.mts';
import { indicesDown, removalSpan } from '../shared/spans.mts';

const CLASS_HEAD = /(?<![\w.:])class\s+[A-Za-z_]/gu;
const EMPTY_BRACES = /^\{\s*\}/u;
const HEADER_JOINS = ',:{';
const FINALLY_BLOCK = /(\s*finally\s*\{\s*\})/gu;
const INIT_KEYWORD = 'init';
const INIT_BLOCK = /(?<![\w.])init\s*\{\s*\}/gu;
const DEFAULT_CONSTRUCTOR = /(?<![\w.:])class\s+[A-Za-z_]\w*(?:<[^<>{}()]*>)?(\s*\(\s*\))/gu;
const BLOCKED_CLASS = /\b(?:enum|annotation)\s+$/u;
const BLOCKED_CONSTRUCTOR = /\bannotation\s+$/u;

function blankBetween(source: string, from: number, to: number): boolean {
  return source.slice(from, to).replaceAll(/[\s{}()]/gu, '') === '';
}

const BRACE_DEPTH: Readonly<Record<string, number>> = { '}': 1, '{': -1 };

function matchingOpen(code: string, close: number): number | undefined {
  let depth = 0;
  return indicesDown(close).find((at) => {
    depth += BRACE_DEPTH[code.charAt(at)] ?? 0;
    return depth === 0;
  });
}

function sameDeclaration(code: string, index: number, blocked: RegExp): boolean {
  const before = code.slice(code.lastIndexOf('\n', index - 1) + 1, index);
  return !blocked.test(before);
}

const GROUP_DEPTH: Readonly<Record<string, number>> = { '(': 1, '[': 1, ')': -1, ']': -1 };
const HEADER_ENDS = ';}=';
const DETEKT = 'detekt';

function endsHeader(code: string, position: number, depth: number): boolean {
  const character = code.charAt(position);
  return (
    depth === 0 &&
    (character === '{' ||
      HEADER_ENDS.includes(character) ||
      (character === '\n' && !continuesHeader(code, position)))
  );
}

function headerBrace(code: string, from: number): number {
  let depth = 0;
  for (const [offset, character] of code.slice(from).split('').entries()) {
    depth += GROUP_DEPTH[character] ?? 0;
    if (endsHeader(code, from + offset, depth)) {
      return character === '{' ? from + offset : -1;
    }
  }
  return -1;
}

function joins(character: string | undefined): boolean {
  return character !== undefined && HEADER_JOINS.includes(character);
}

function continuesHeader(code: string, newline: number): boolean {
  const before = code.slice(0, newline).trimEnd();
  const after = code.slice(newline).trimStart();
  return joins(before.at(-1)) || joins(after[0]);
}

function emptyClassBlocks({ code, source }: ScannedKotlin): KotlinFound[] {
  return [...code.matchAll(CLASS_HEAD)].flatMap(({ index, 0: text }) => {
    const open = headerBrace(code, index + text.length);
    const empty = open === -1 ? undefined : EMPTY_BRACES.exec(code.slice(open))?.[0];
    if (empty === undefined || !sameDeclaration(code, index, BLOCKED_CLASS)) {
      return [];
    }
    const start = code.slice(0, open).trimEnd().length;
    const end = open + empty.length;
    return blankBetween(source, start, end)
      ? [
          {
            rule: 'detekt.empty-blocks.EmptyClassBlock',
            offset: index,
            edits: [{ start, end, text: '' }],
          },
        ]
      : [];
  });
}

function emptyFinallyBlocks({ code, source }: ScannedKotlin): KotlinFound[] {
  return [...code.matchAll(FINALLY_BLOCK)].flatMap(({ index, 0: block }) => {
    const before = code.slice(0, index);
    if (!/\}\s*$/u.test(before)) {
      return [];
    }
    const close = before.trimEnd().length - 1;
    const open = matchingOpen(code, close);
    const catches = open !== undefined && /\bcatch\s*\([^()]*\)\s*$/u.test(code.slice(0, open));
    return catches && blankBetween(source, index + block.lastIndexOf('{'), index + block.length)
      ? [
          {
            rule: 'detekt.empty-blocks.EmptyFinallyBlock',
            offset: index + block.length - 1,
            edits: [{ start: index, end: index + block.length, text: '' }],
          },
        ]
      : [];
  });
}

function initOnlyBody(code: string, source: string, index: number): Span | undefined {
  const open = enclosingOpen(code, index);
  const close = open === -1 ? -1 : closingIndex(code, open);
  if (open === -1 || close >= code.length || kindOfBody(code, open) === 'other') {
    return undefined;
  }
  const onlyInit =
    source
      .slice(open + 1, close)
      .replaceAll(INIT_BLOCK, '')
      .trim() === '';
  const start = code.slice(0, open).trimEnd().length;
  return onlyInit ? { start, end: close + 1 } : undefined;
}

function emptyInitBlocks({ code, source }: ScannedKotlin): KotlinFound[] {
  const seen = new Set<number>();
  return [...code.matchAll(INIT_BLOCK)].flatMap(({ index, 0: text }) => {
    const owner = enclosingBodyKind(code, index);
    if (
      owner === undefined ||
      owner === 'other' ||
      !blankBetween(source, index + INIT_KEYWORD.length, index + text.length)
    ) {
      return [];
    }
    const body = initOnlyBody(code, source, index);
    if (body === undefined) {
      return [found(index, removalSpan(source, index, index + text.length))];
    }
    const first = !seen.has(body.start);
    seen.add(body.start);
    return first ? [found(index, body)] : [];
  });
}

function found(offset: number, span: Span): KotlinFound {
  return { rule: 'detekt.empty-blocks.EmptyInitBlock', offset, edits: [{ ...span, text: '' }] };
}

function emptyDefaultConstructors({ code }: ScannedKotlin): KotlinFound[] {
  return [...code.matchAll(DEFAULT_CONSTRUCTOR)]
    .filter(({ index, 0: text }) => {
      const end = headerBrace(code, index + text.length);
      const inner = end === -1 ? '' : code.slice(end, closingIndex(code, end) + 1);
      return (
        sameDeclaration(code, index, BLOCKED_CONSTRUCTOR) && !/\bconstructor\s*\(/u.test(inner)
      );
    })
    .map(({ index, 0: text, 1: parens }) => ({
      rule: 'detekt.empty-blocks.EmptyDefaultConstructor',
      offset: index,
      edits: [
        { start: index + text.length - (parens?.length ?? 0), end: index + text.length, text: '' },
      ],
    }));
}

export const emptyBlocksRecipe = kotlinRecipe({
  id: 'kotlin-empty-blocks',
  keepComments: true,
  rules: [
    { tool: DETEKT, rule: 'detekt.empty-blocks.EmptyClassBlock' },
    { tool: DETEKT, rule: 'detekt.empty-blocks.EmptyFinallyBlock' },
    { tool: DETEKT, rule: 'detekt.empty-blocks.EmptyInitBlock' },
    { tool: DETEKT, rule: 'detekt.empty-blocks.EmptyDefaultConstructor' },
  ],
  where: 'both',
  find: (scanned) => [
    ...emptyClassBlocks(scanned),
    ...emptyFinallyBlocks(scanned),
    ...emptyInitBlocks(scanned),
    ...emptyDefaultConstructors(scanned),
  ],
});
