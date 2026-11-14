const LEFT_OPEN = /(?:[({,;]|\|\||(?<![=!<>])=|->|\breturn|\belse)$/u;
const LEFT_CONTINUES = /(?:&&|[+\-*/%<>!?:.,])$/u;
const RIGHT_CLOSED = /^(?:[)\]},;{]|\|\|)/u;
const RIGHT_CONTINUES = /^(?:[.?:=!<>+\-*/%&|[]|as\b|in\b|is\b)/u;

export function leftIsolated(code, index) {
  const before = code.slice(0, index).trimEnd();
  if (before === '' || LEFT_OPEN.test(before)) {
    return true;
  }
  return code.slice(before.length, index).includes('\n') && !LEFT_CONTINUES.test(before);
}

export function rightIsolated(code, end) {
  const rest = code.slice(end);
  const next = rest.trimStart();
  if (next === '' || RIGHT_CLOSED.test(next)) {
    return true;
  }
  return rest.slice(0, rest.length - next.length).includes('\n') && !RIGHT_CONTINUES.test(next);
}

export function withoutGroups(text) {
  let depth = 0;
  let kept = '';
  for (const character of text) {
    if ('([{'.includes(character)) {
      depth += 1;
    } else if (')]}'.includes(character)) {
      depth -= 1;
    } else if (depth === 0) {
      kept += character;
    }
  }
  return kept;
}
