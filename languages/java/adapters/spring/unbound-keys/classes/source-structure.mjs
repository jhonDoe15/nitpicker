const OPENERS = { '(': ')', '{': '}', '[': ']', '<': '>' };
const CLOSERS = new Set([')', '}', ']', '>']);
const LITERAL = /"""([\s\S]*?)"""|"((?:\\.|[^"\\\n])*)"/gu;
const TEXT_BLOCK_OPEN = 3;

function depthChange(character, { open, close }) {
  if (character === open) {
    return 1;
  }
  return character === close ? -1 : 0;
}

function escaped(character) {
  return character.replace(/[[\]()]/u, String.raw`\$&`);
}

export function closingIndex(text, start) {
  const pair = { open: text[start], close: OPENERS[text[start]] };
  if (pair.close === undefined) {
    return text.length;
  }
  const brackets = new RegExp(`[${escaped(pair.open)}${escaped(pair.close)}]`, 'gu');
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

function isCloser(text, index, angles) {
  const character = text[index];
  if (character === '>') {
    return angles && text[index - 1] !== '-';
  }
  return CLOSERS.has(character);
}

export function topLevelParts(text, separators, { angles = true } = {}) {
  const parts = [{ start: 0, text: '' }];
  let depth = 0;
  for (const [index, character] of [...text].entries()) {
    const opens = character in OPENERS && (angles || character !== '<');
    depth = Math.max(0, depth + (opens ? 1 : 0) - (isCloser(text, index, angles) ? 1 : 0));
    if (depth === 0 && separators.includes(character)) {
      parts.push({ start: index + 1, text: '' });
    } else {
      parts.at(-1).text += character;
    }
  }
  return parts.filter((part) => part.text.trim() !== '');
}

export function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function blockLines(match) {
  const lines = match[1].split('\n');
  return lines.map((line, index) => ({
    value: line.trim(),
    offset: match.index + TEXT_BLOCK_OPEN + lines.slice(0, index).join('\n').length + index,
    continued: false,
  }));
}

export function stringLiterals(text) {
  return [...text.matchAll(LITERAL)].flatMap((match) =>
    match[1] === undefined
      ? [
          {
            value: match[2],
            offset: match.index,
            continued: text.slice(0, match.index).trimEnd().endsWith('+'),
          },
        ]
      : blockLines(match),
  );
}

function memberCharacter(character, depth) {
  if (character === '{') {
    return depth === 0 ? '{};' : '';
  }
  if (character === '}') {
    return depth === 1 ? ';' : '';
  }
  return depth === 0 ? character : '';
}

export function memberText(body) {
  let depth = 0;
  let kept = '';
  for (const character of body) {
    kept += memberCharacter(character, depth);
    depth = Math.max(0, depth + depthChange(character, { open: '{', close: '}' }));
  }
  return kept;
}
