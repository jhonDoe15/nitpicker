import { closingIndex } from '../../../../adapters/kotlin/scan/kotlin-source.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';
import { indicesDown, removalSpan } from '../shared/spans.mjs';

const CLASS_HEAD = /(?<![\w.:])class\s+[A-Za-z_]/gu;
const EMPTY_BRACES = /^\{\s*\}/u;
const HEADER_JOINS = ',:{';
const FINALLY_BLOCK = /(\s*finally\s*\{\s*\})/gu;
const INIT_BLOCK = /(?<![\w.])init\s*\{\s*\}/gu;
const DEFAULT_CONSTRUCTOR = /(?<![\w.:])class\s+[A-Za-z_]\w*(?:<[^<>{}()]*>)?(\s*\(\s*\))/gu;
const BLOCKED_KIND = /\b(?:enum|annotation|data|value|inner)\s+$/u;

function blankBetween(source, from, to) {
  return source.slice(from, to).replaceAll(/[\s{}()]/gu, '') === '';
}

const BRACE_DEPTH = { '}': 1, '{': -1 };

function matchingOpen(code, close) {
  let depth = 0;
  return indicesDown(close).find((at) => {
    depth += BRACE_DEPTH[code[at]] ?? 0;
    return depth === 0;
  });
}

function sameDeclaration(code, index) {
  const before = code.slice(code.lastIndexOf('\n', index - 1) + 1, index);
  return !BLOCKED_KIND.test(before);
}

const GROUP_DEPTH = { '(': 1, '[': 1, ')': -1, ']': -1 };
const HEADER_ENDS = ';}=';
const DETEKT = 'detekt';

function endsHeader(code, position, depth) {
  const character = code[position];
  return (
    depth === 0 &&
    (character === '{' ||
      HEADER_ENDS.includes(character) ||
      (character === '\n' && !continuesHeader(code, position)))
  );
}

function headerBrace(code, from) {
  let depth = 0;
  for (const [offset, character] of code.slice(from).split('').entries()) {
    depth += GROUP_DEPTH[character] ?? 0;
    if (endsHeader(code, from + offset, depth)) {
      return character === '{' ? from + offset : -1;
    }
  }
  return -1;
}

function continuesHeader(code, newline) {
  const before = code.slice(0, newline).trimEnd();
  const after = code.slice(newline).trimStart();
  return HEADER_JOINS.includes(before.at(-1)) || HEADER_JOINS.includes(after[0]);
}

function emptyClassBlocks({ code, source }) {
  return [...code.matchAll(CLASS_HEAD)].flatMap(({ index, 0: text }) => {
    const open = headerBrace(code, index + text.length);
    const empty = open === -1 ? undefined : EMPTY_BRACES.exec(code.slice(open))?.[0];
    if (empty === undefined || !sameDeclaration(code, index)) {
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

function emptyFinallyBlocks({ code, source }) {
  return [...code.matchAll(FINALLY_BLOCK)].flatMap(({ index, 1: block }) => {
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

function emptyInitBlocks({ code, source }) {
  return [...code.matchAll(INIT_BLOCK)]
    .filter(({ index, 0: text }) =>
      blankBetween(source, index + 'init'.length, index + text.length),
    )
    .map(({ index, 0: text }) => ({
      rule: 'detekt.empty-blocks.EmptyInitBlock',
      offset: index,
      edits: [{ ...removalSpan(source, index, index + text.length), text: '' }],
    }));
}

function emptyDefaultConstructors({ code }) {
  return [...code.matchAll(DEFAULT_CONSTRUCTOR)]
    .filter(({ index, 0: text }) => {
      const after = code.slice(index + text.length);
      const body = /^[^{;\n]*\{/u.exec(after);
      const end = body === null ? -1 : index + text.length + body[0].length - 1;
      const inner = end === -1 ? '' : code.slice(end, closingIndex(code, end) + 1);
      return sameDeclaration(code, index) && !/\bconstructor\s*\(/u.test(inner);
    })
    .map(({ index, 0: text, 1: parens }) => ({
      rule: 'detekt.empty-blocks.EmptyDefaultConstructor',
      offset: index,
      edits: [{ start: index + text.length - parens.length, end: index + text.length, text: '' }],
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
