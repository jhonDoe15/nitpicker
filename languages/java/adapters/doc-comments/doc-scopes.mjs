import {
  descriptionLines,
  tagsHaveContent,
} from '../../../../shared/rules/doc-comments/doc-comments.mjs';

const BLOCK_TAG = /^@[A-Za-z][\w-]*(?=[\s{]|$)/u;
const OPENERS = { '(': ')', '[': ']', '{': '}', '<': '>' };
const CLOSERS = new Set(Object.values(OPENERS));
const NAME_AT_END = /(`[^`\n]+`|[A-Za-z_$][\w$]*)(?:\s*\[\s*\])*\s*$/u;

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

function innermostPair(pairs, offset) {
  return pairs.findLastIndex(({ open, close }) => open < offset && offset < close);
}

export function scopeAt({ pairs, types }, offset) {
  const direct = innermostPair(pairs, offset);
  const chain = [];
  for (let pair = direct; pair >= 0; pair = pairs[pair].parent) {
    const type = types.get(pairs[pair].open);
    if (type !== undefined) {
      chain.unshift(type.name);
    }
  }
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
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === '<') {
      depth += 1;
    } else if (code[index] === '>' && !isArrow(code, index)) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return code.length;
}

export function headerUntil(code, from, stops) {
  let depth = 0;
  for (let index = from; index < code.length; index += 1) {
    const character = code[index];
    if (character === '<') {
      depth += 1;
    } else if (character === '>' && !isArrow(code, index)) {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && stops.includes(character)) {
      return { text: code.slice(from, index).trim(), stop: character, at: index };
    }
  }
  return { text: code.slice(from).trim(), stop: '', at: code.length };
}

export function nameAtEnd(header) {
  const match = NAME_AT_END.exec(header);
  return match === null ? undefined : match[1].replaceAll('`', '');
}

export function withoutGenerics(text) {
  let previous;
  let current = text;
  while (current !== previous) {
    previous = current;
    current = current.replaceAll(/<[^<>]*>/gu, ' ');
  }
  return current;
}

export function skipSpace(code, from) {
  const match = /\S/u.exec(code.slice(from));
  return match === null ? code.length : from + match.index;
}

export function docComment({ text, marker, line, declared, chain }) {
  const options = { blockTag: BLOCK_TAG, marker };
  const qualified = [...chain, declared.name].join('.');
  return {
    line,
    name: declared.name,
    qualifier:
      declared.parameters === undefined ? qualified : `${qualified}(${declared.parameters})`,
    lines: descriptionLines(text, options),
    detailed: tagsHaveContent(text, options),
  };
}
