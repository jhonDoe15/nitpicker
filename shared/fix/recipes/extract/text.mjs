const LEADING_SPACE = /^[ \t]*/u;

export function indentOf(text, offset) {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  return LEADING_SPACE.exec(text.slice(lineStart, offset))[0];
}

function indentWidth(line) {
  return LEADING_SPACE.exec(line)[0].length;
}

export function dedented(text, width) {
  const [first, ...rest] = text.split('\n');
  return [first, ...rest.map((line) => line.slice(Math.min(width, indentWidth(line))))].join('\n');
}

export function dedentedToLeast(text) {
  const [, ...rest] = text.split('\n');
  const widths = rest.filter((line) => line.trim() !== '').map(indentWidth);
  return dedented(text, widths.length === 0 ? 0 : Math.min(...widths));
}

export function indentedBy(text, prefix) {
  return text.replaceAll(/^(?=.)/gmu, prefix);
}
