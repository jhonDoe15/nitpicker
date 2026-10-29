import {
  descriptionLines,
  tagsHaveContent,
} from '../../../../shared/rules/doc-comments/doc-comments.mjs';

export const IDENTIFIER = String.raw`[\p{L}_$][\p{L}\p{N}_$]*`;

const BLOCK_TAG = /^@[A-Za-z][\w-]*(?=[\s{[]|$)/u;
const OPENERS = { '(': ')', '[': ']', '{': '}', '<': '>' };
const CLOSERS = new Set(Object.values(OPENERS));
const NAME_AT_END = new RegExp(
  String.raw`(\x60[^\x60\n]+\x60|${IDENTIFIER})(?:\s*\[\s*\])*\s*$`,
  'u',
);
const ANGLES = /->|[<>]/gu;
const SPACE = /\S/gu;

export function matchesFrom(text, pattern, from) {
  const marks = new RegExp(pattern.source, pattern.flags);
  marks.lastIndex = from;
  return text.matchAll(marks);
}

export function lineStarts(source) {
  return [0, ...[...source.matchAll(/\n/gu)].map(({ index }) => index + 1)];
}

export function lineAt(starts, offset) {
  return starts.findLastIndex((start) => start <= offset) + 1;
}

export function bracePairs(code) {
  const pairs = [];
  const open = [];
  for (const { index, 0: brace } of code.matchAll(/[{}]/gu)) {
    if (brace === '{') {
      pairs.push({ open: index, close: code.length, parent: open.at(-1) ?? -1 });
      open.push(pairs.length - 1);
    } else if (open.length > 0) {
      pairs[open.pop()].close = index;
    }
  }
  return pairs;
}

function ancestors(pairs, pair) {
  const chain = pair < 0 ? [] : [pair];
  for (const current of chain) {
    const { parent } = pairs[current];
    chain.push(...(parent < 0 ? [] : [parent]));
  }
  return chain.toReversed();
}

function innermostPair(pairs, offset) {
  const opened = pairs.findLastIndex(({ open }) => open < offset);
  return ancestors(pairs, opened).findLast((pair) => offset < pairs[pair].close) ?? -1;
}

export function scopeAt({ pairs, types }, offset) {
  const direct = innermostPair(pairs, offset);
  const chain = ancestors(pairs, direct)
    .map((pair) => types.get(pairs[pair].open)?.name)
    .filter((name) => name !== undefined);
  return {
    chain,
    type: direct < 0 ? undefined : types.get(pairs[direct].open),
    declarable: direct < 0 || types.has(pairs[direct].open),
  };
}

function isArrow(text, index) {
  return text[index] === '>' && text[index - 1] === '-';
}

export function topLevelParts(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (const [index, character] of [...text].entries()) {
    if (character in OPENERS) {
      depth += 1;
    } else if (CLOSERS.has(character) && !isArrow(text, index)) {
      depth = Math.max(0, depth - 1);
    } else if (character === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, text.slice(start)].map((part) => part.trim()).filter((part) => part !== '');
}

export function closingAngle(code, open) {
  let depth = 0;
  for (const { index, 0: mark } of matchesFrom(code, ANGLES, open)) {
    depth += { '<': 1, '>': -1 }[mark] ?? 0;
    if (depth === 0) {
      return index;
    }
  }
  return code.length;
}

function escaped(characters) {
  return characters.replaceAll(/[\\\]^-]/gu, String.raw`\$&`);
}

export function headerUntil(code, from, stops) {
  const marks = new RegExp(String.raw`->|[<>]|[${escaped(stops)}]`, 'gu');
  let depth = 0;
  for (const { index, 0: mark } of matchesFrom(code, marks, from)) {
    const change = { '<': 1, '>': -1 }[mark];
    depth = Math.max(0, depth + (change ?? 0));
    if (change === undefined && mark !== '->' && depth === 0) {
      return { text: code.slice(from, index).trim(), stop: mark, at: index };
    }
  }
  return { text: code.slice(from).trim(), stop: '', at: code.length };
}

export function nameIndex(header) {
  return NAME_AT_END.exec(header)?.index ?? header.length;
}

export function nameAtEnd(header) {
  const match = NAME_AT_END.exec(header);
  return match === null ? undefined : match[1].replaceAll('`', '');
}

export function withoutGenerics(text) {
  const versions = [text];
  for (const version of versions) {
    const next = version.replaceAll(/<[^<>]*>/gu, ' ');
    versions.push(...(next === version ? [] : [next]));
  }
  return versions.at(-1);
}

export function skipSpace(code, from) {
  const [found] = matchesFrom(code, SPACE, from);
  return found === undefined ? code.length : found.index;
}

export function docComment({ text, marker, line, declared, chain }) {
  const options = { blockTag: BLOCK_TAG, marker };
  const qualified = [...chain, declared.receiver, declared.name]
    .filter((part) => part !== undefined)
    .join('.');
  return {
    line,
    name: declared.name,
    qualifier:
      declared.parameters === undefined ? qualified : `${qualified}(${declared.parameters})`,
    lines: descriptionLines(text, options),
    detailed: tagsHaveContent(text, options),
  };
}
