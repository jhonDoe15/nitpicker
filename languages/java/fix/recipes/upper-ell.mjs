const JAVA_FILE = /\.java$/u;
const IDENTIFIER_PART = /[\p{L}\p{N}_$]/u;
const LONG_LITERAL = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*)l/uy;
const TEXT_BLOCK = '"""';

function skipQuoted(text, start, quote) {
  let index = start + 1;
  while (index < text.length && text[index] !== quote && text[index] !== '\n') {
    index += text[index] === '\\' ? 2 : 1;
  }
  return index + 1;
}

function skipTextBlock(text, start) {
  let index = start + TEXT_BLOCK.length;
  while (index < text.length && !text.startsWith(TEXT_BLOCK, index)) {
    index += text[index] === '\\' ? 2 : 1;
  }
  return index + TEXT_BLOCK.length;
}

function skipped(text, index) {
  if (text.startsWith('//', index)) {
    const end = text.indexOf('\n', index);
    return end === -1 ? text.length : end;
  }
  if (text.startsWith('/*', index)) {
    const end = text.indexOf('*/', index + 2);
    return end === -1 ? text.length : end + 2;
  }
  if (text.startsWith(TEXT_BLOCK, index)) {
    return skipTextBlock(text, index);
  }
  if (text[index] === '"' || text[index] === "'") {
    return skipQuoted(text, index, text[index]);
  }
  return undefined;
}

function literalEnd(text, index) {
  if (index > 0 && (IDENTIFIER_PART.test(text[index - 1]) || text[index - 1] === '.')) {
    return undefined;
  }
  LONG_LITERAL.lastIndex = index;
  const match = LONG_LITERAL.exec(text);
  if (match === null) {
    return undefined;
  }
  const end = index + match[0].length;
  return end < text.length && IDENTIFIER_PART.test(text[end]) ? undefined : end;
}

export function lowercaseEllOffsets(text) {
  const offsets = [];
  let index = 0;
  while (index < text.length) {
    const next = skipped(text, index);
    if (next !== undefined) {
      index = next;
      continue;
    }
    const end = /\d/u.test(text[index]) ? literalEnd(text, index) : undefined;
    if (end !== undefined) {
      offsets.push(end - 1);
    }
    index = end ?? index + 1;
  }
  return offsets;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

export const upperEllRecipe = {
  id: 'java-upper-ell',
  rules: [{ tool: 'checkstyle', rule: 'UpperEll' }],
  presets: ['java'],
  scope: 'file',
  safety: 'safe',
  plan({ files }) {
    return {
      fixes: files
        .filter(({ path: name }) => JAVA_FILE.test(name))
        .flatMap(({ path: name, text }) =>
          lowercaseEllOffsets(text).map((offset) => ({
            finding: {
              tool: 'checkstyle',
              rule: 'UpperEll',
              path: name,
              line: lineAt(text, offset),
            },
            edits: [{ type: 'replace', path: name, start: offset, end: offset + 1, text: 'L' }],
          })),
        ),
    };
  },
};
