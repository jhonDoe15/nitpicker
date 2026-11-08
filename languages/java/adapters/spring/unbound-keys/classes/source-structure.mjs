const OPENERS = { '(': ')', '{': '}', '[': ']', '<': '>' };
const CLOSERS = new Set([')', '}', ']', '>']);

function depthChange(character, { open, close }) {
  if (character === open) {
    return 1;
  }
  return character === close ? -1 : 0;
}

export function closingIndex(text, start) {
  const pair = { open: text[start], close: OPENERS[text[start]] };
  let depth = 0;
  for (const [offset, character] of [...text.slice(start)].entries()) {
    depth += depthChange(character, pair);
    if (depth === 0) {
      return start + offset;
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

export function stringLiterals(text) {
  return [...text.matchAll(/"((?:\\.|[^"\\\n])*)"/gu)].map((match) => ({
    value: match[1],
    offset: match.index,
    continued: text.slice(0, match.index).trimEnd().endsWith('+'),
  }));
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
