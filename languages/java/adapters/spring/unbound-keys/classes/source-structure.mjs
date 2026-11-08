const OPENERS = { '(': ')', '{': '}', '[': ']', '<': '>' };
const CLOSERS = new Set([')', '}', ']', '>']);

export function closingIndex(text, start) {
  const open = text[start];
  const close = OPENERS[open];
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === open) {
      depth += 1;
    } else if (text[index] === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return text.length;
}

export function topLevelParts(text, separators, { angles = true } = {}) {
  const parts = [{ start: 0, text: '' }];
  let depth = 0;
  for (const [index, character] of [...text].entries()) {
    const counted = angles || (character !== '<' && character !== '>');
    if (counted && character in OPENERS) {
      depth += 1;
    } else if (
      counted &&
      CLOSERS.has(character) &&
      !(character === '>' && text[index - 1] === '-')
    ) {
      depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && separators.includes(character)) {
      parts.push({ start: index + 1, text: '' });
    } else {
      parts[parts.length - 1].text += character;
    }
  }
  return parts.filter((part) => part.text.trim() !== '');
}

export function lineAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === '\n') {
      line += 1;
    }
  }
  return line;
}

export function stringLiterals(text) {
  return [...text.matchAll(/"((?:\\.|[^"\\\n])*)"/gu)].map((match) => ({
    value: match[1],
    offset: match.index,
    continued: /\+\s*$/u.test(text.slice(0, match.index)),
  }));
}

export function memberText(body) {
  let depth = 0;
  let kept = '';
  for (const character of body) {
    if (character === '{') {
      depth += 1;
      kept += depth === 1 ? '{};' : '';
    } else if (character === '}') {
      depth = Math.max(0, depth - 1);
      kept += depth === 0 ? ';' : '';
    } else if (depth === 0) {
      kept += character;
    }
  }
  return kept;
}
