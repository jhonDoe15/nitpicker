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
  let end = header + 1;
  while (end < lines.length) {
    const line = lines[end];
    const inside = isBlank(line) || indentOf(line) > indent || CLOSING_LINE.test(line);
    if (!inside) {
      break;
    }
    end += 1;
  }
  while (end > header + 1 && isBlank(lines[end - 1])) {
    end -= 1;
  }
  return end;
}

function decoratorStart(lines, header) {
  const indent = indentOf(lines[header]);
  let start = header;
  for (let index = header - 1; index >= 0 && !isBlank(lines[index]); index -= 1) {
    const line = lines[index];
    if (indentOf(line) === indent && line.trim().startsWith('@')) {
      start = index;
    } else if (indentOf(line) <= indent && !CLOSING_LINE.test(line)) {
      break;
    }
  }
  return start;
}

function findHeader(lines, { from, to }, pattern) {
  const body = lines.slice(from, to).find((line) => !isBlank(line));
  const childIndent = body === undefined ? 0 : indentOf(body);
  for (let index = from; index < to; index += 1) {
    if (pattern.test(lines[index]) && indentOf(lines[index]) === childIndent) {
      return index;
    }
  }
  return undefined;
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
