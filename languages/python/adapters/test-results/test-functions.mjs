const CLOSING_LINE = /^\s*[)\]}]/;

function indentOf(line) {
  return /^\s*/.exec(line)[0].length;
}

function isBlank(line) {
  return line.trim() === '' || line.trim().startsWith('#');
}

function headerPattern(name, isLast) {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const keyword = isLast ? String.raw`(?:async\s+)?def` : 'class';
  return new RegExp(String.raw`^\s*${keyword}\s+${escaped}\b`);
}

function blockEnd(lines, header) {
  const indent = indentOf(lines[header]);
  const outside = lines
    .slice(header + 1)
    .findIndex((line) => !isBlank(line) && indentOf(line) <= indent && !CLOSING_LINE.test(line));
  const end = outside === -1 ? lines.length : header + 1 + outside;
  const body = lines.slice(header + 1, end);
  const trailingBlank = body.length - 1 - body.findLastIndex((line) => !isBlank(line));
  return end - Math.min(trailingBlank, body.length);
}

function decoratorStart(lines, header) {
  const indent = indentOf(lines[header]);
  let start = header;
  for (const [offset, line] of lines.slice(0, header).toReversed().entries()) {
    const isDecorator = indentOf(line) === indent && line.trim().startsWith('@');
    if (isBlank(line) || (!isDecorator && indentOf(line) <= indent && !CLOSING_LINE.test(line))) {
      break;
    }
    if (isDecorator) {
      start = header - 1 - offset;
    }
  }
  return start;
}

function findHeader(lines, { from, to }, pattern) {
  const block = lines.slice(from, to);
  const body = block.find((line) => !isBlank(line));
  const childIndent = body === undefined ? 0 : indentOf(body);
  const found = block.findIndex((line) => pattern.test(line) && indentOf(line) === childIndent);
  return found === -1 ? undefined : from + found;
}

export function testFunction(text, path) {
  const lines = text.split(/\r?\n/);
  let range = { from: 0, to: lines.length };
  let header;
  for (const [index, name] of path.entries()) {
    header = findHeader(lines, range, headerPattern(name, index === path.length - 1));
    if (header === undefined) {
      return undefined;
    }
    range = { from: header + 1, to: blockEnd(lines, header) };
  }
  const start = decoratorStart(lines, header);
  return {
    line: header + 1,
    text: lines
      .slice(start, range.to)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join('\n'),
  };
}

export function testPath(test) {
  return test.replace(/\[.*\]$/s, '').split('::');
}
