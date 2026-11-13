const HEADER = /^[ \t]*\[\[?([^\]]+)\]\]?[ \t]*(?:#.*)?$/u;
const TOKEN = /"(?:[^"\\\n]|\\.)*"|'[^'\n]*'|#[^\n]*|[^\s,]/gu;
const KEY = /^([ \t]*)("[^"]*"|'[^']*'|[\w.-]+)[ \t]*=[ \t]*/u;
const STRING = /"(?:[^"\\\n]|\\.)*"|'[^'\n]*'/gu;

function unquoted(key) {
  return /^["']/u.test(key) ? key.slice(1, -1) : key;
}

function depthChange(text) {
  const code = text.replaceAll(STRING, '""').replace(/#.*$/u, '');
  return [...code].reduce(
    (depth, character) =>
      depth +
      Number(character === '[' || character === '{') -
      Number(character === ']' || character === '}'),
    0,
  );
}

function lineRanges(text) {
  let start = 0;
  return text
    .split(/(?<=\n)/u)
    .filter((raw) => raw !== '')
    .map((raw) => {
      const range = { start, next: start + raw.length, content: raw.replace(/\r?\n$/u, '') };
      start += raw.length;
      return range;
    });
}

function keyAt(lines, index, text) {
  const line = lines[index];
  const match = KEY.exec(line.content);
  let depth = depthChange(line.content.slice(match[0].length));
  let last = index;
  for (const following of lines.slice(index + 1)) {
    if (depth <= 0) {
      break;
    }
    last += 1;
    depth += depthChange(following.content);
  }
  const valueStart = line.start + match[0].length;
  const end = lines[last].start + lines[last].content.length;
  return {
    key: unquoted(match[2]),
    lineStart: line.start,
    lineEnd: lines[last].next,
    valueStart,
    valueEnd: end,
    multiline: last > index,
    source: text.slice(valueStart, end),
    last,
  };
}

export function scanToml(text) {
  const lines = lineRanges(text);
  const sections = [{ name: '', start: 0, bodyStart: 0, keys: [] }];
  let skipUntil = -1;
  for (const [index, line] of lines.entries()) {
    const header = HEADER.exec(line.content);
    if (index <= skipUntil) {
      continue;
    }
    if (header !== null) {
      sections.push({
        name: header[1].trim().replaceAll(/\s*\.\s*/gu, '.'),
        start: line.start,
        bodyStart: line.next,
        keys: [],
      });
    } else if (KEY.test(line.content)) {
      const key = keyAt(lines, index, text);
      sections.at(-1).keys.push(key);
      skipUntil = key.last;
    }
  }
  return sections;
}

export function arrayElements(text, key) {
  const open = key.valueStart;
  if (text[open] !== '[') {
    return undefined;
  }
  const elements = [];
  for (const match of text.slice(open + 1, key.valueEnd).matchAll(TOKEN)) {
    const [token] = match;
    const start = open + 1 + match.index;
    if (token === ']') {
      return { open, close: start, elements };
    }
    if (token[0] === '"' || token[0] === "'") {
      elements.push({ start, end: start + token.length, raw: token, value: token.slice(1, -1) });
    } else if (token[0] !== '#') {
      return undefined;
    }
  }
  return undefined;
}
