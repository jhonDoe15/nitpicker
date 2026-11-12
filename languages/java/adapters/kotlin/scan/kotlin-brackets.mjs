const BRACKETS = { '(': /[()]/g, '{': /[{}]/g, '[': /[[\]]/g };
const ARGUMENT_MARK = /[()[\]{},]/g;

export function matchesFrom(text, pattern, from) {
  const marks = new RegExp(pattern.source, 'g');
  marks.lastIndex = from;
  return text.matchAll(marks);
}

export function closingIndex(code, open) {
  const opener = code[open];
  let depth = 0;
  for (const { index, 0: bracket } of matchesFrom(code, BRACKETS[opener], open)) {
    depth += bracket === opener ? 1 : -1;
    if (depth === 0) {
      return index;
    }
  }
  return code.length;
}

export function splitArguments(code, open) {
  const close = closingIndex(code, open);
  const parts = [];
  let depth = 0;
  let start = open + 1;
  for (const { index, 0: mark } of matchesFrom(code.slice(0, close), ARGUMENT_MARK, open + 1)) {
    if (mark === ',' && depth === 0) {
      parts.push({ start, end: index });
      start = index + 1;
    } else if (mark !== ',') {
      depth += '([{'.includes(mark) ? 1 : -1;
    }
  }
  if (code.slice(start, close).trim() !== '') {
    parts.push({ start, end: close });
  }
  return { close, parts };
}

function depthsOf(code, opener) {
  const depths = new Int32Array(code.length + 1);
  let depth = 0;
  let cursor = 0;
  for (const { index, 0: bracket } of code.matchAll(BRACKETS[opener])) {
    const opens = bracket === opener;
    const next = opens ? index + 1 : index;
    depths.fill(depth, cursor, next);
    depth += opens ? 1 : -1;
    cursor = next;
  }
  depths.fill(depth, cursor);
  return depths;
}

export function braceDepths(code) {
  return depthsOf(code, '{');
}

export function parenDepths(code) {
  return depthsOf(code, '(');
}

export function enclosingOpen(code, offset) {
  const open = [];
  for (const { index, 0: brace } of code.slice(0, offset).matchAll(BRACKETS['{'])) {
    if (brace === '{') {
      open.push(index);
    } else {
      open.pop();
    }
  }
  return open.at(-1) ?? -1;
}
