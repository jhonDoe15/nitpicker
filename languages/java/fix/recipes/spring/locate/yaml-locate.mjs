import { unquote } from '../../../../adapters/spring/spring-config-parser.mjs';
const BLOCK_STARTS = new Set(['&', '!', '|', '>', '{']);
const DOUBLE_QUOTED = /^"(?:[^"\\]|\\.)*"$/;
const SINGLE_QUOTED = /^'(?:[^']|'')*'$/;
const COMMENT_OR_QUOTED = /(?<=^|[\s:[,{])(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')|(?<=^|\s)#/g;

function contentEnd(text) {
  const comment = [...text.matchAll(COMMENT_OR_QUOTED)].find(([found]) => found === '#');
  return comment === undefined ? text.length : comment.index;
}

function keyEndOf(text, from) {
  const quote = text[from] === '"' || text[from] === "'" ? text[from] : undefined;
  const close = quote === undefined ? from : text.indexOf(quote, from + 1);
  const colon = /:(\s|$)/.exec(text.slice(close < 0 ? from : close));
  return colon === null ? undefined : (close < 0 ? from : close) + colon.index;
}

function valueSpan(text, from, to) {
  const raw = text.slice(from, to).trimEnd();
  const end = from + raw.length;
  if (raw === '' || BLOCK_STARTS.has(raw[0])) {
    return undefined;
  }
  if (raw[0] === '[') {
    return raw.endsWith(']') ? { start: from, end, quote: '', flow: true } : undefined;
  }
  if (raw[0] === '"' || raw[0] === "'") {
    const closed = raw[0] === '"' ? DOUBLE_QUOTED.test(raw) : SINGLE_QUOTED.test(raw);
    return closed ? { start: from, end, quote: raw[0] } : undefined;
  }
  return { start: from, end, quote: '' };
}

function skipSpaces(text, from) {
  const rest = text.slice(from);
  return from + (rest.length - rest.trimStart().length);
}

function absolute(span, shift) {
  return span === undefined
    ? undefined
    : { ...span, start: span.start + shift, end: span.end + shift };
}

function located(table, lineNumber, parts) {
  const line = table[lineNumber - 1];
  return {
    first: lineNumber - 1,
    last: lineNumber - 1,
    indent: parts.indent,
    name: parts.name,
    key: absolute(parts.key, line.start),
    value: absolute(parts.value, line.start),
  };
}

function itemParts(text, indent, end) {
  const value = valueSpan(text, skipSpaces(text, indent + 1), end);
  return { indent, value };
}

function pairParts(text, indent, end) {
  const colon = keyEndOf(text, indent);
  if (colon === undefined) {
    return undefined;
  }
  const key = { start: indent, end: colon };
  const name = unquote(text.slice(key.start, key.end).trim());
  return { indent, key, name, value: valueSpan(text, skipSpaces(text, colon + 1), end) };
}

function consistent(parts, entry, text) {
  if (parts?.value === undefined) {
    return false;
  }
  const raw = text.slice(parts.value.start, parts.value.end);
  if (parts.name === undefined) {
    return entry.list && unquote(raw) === entry.value;
  }
  const named = entry.key === parts.name || entry.key.endsWith(`.${parts.name}`);
  return named && (parts.value.flow ? entry.list : !entry.list && unquote(raw) === entry.value);
}

export function yamlAt(table, lineNumber, entry) {
  const line = table[lineNumber - 1];
  if (line === undefined) {
    return undefined;
  }
  const { text } = line;
  const indent = text.length - text.trimStart().length;
  const end = contentEnd(text);
  const parts = /^-(\s|$)/.test(text.slice(indent))
    ? itemParts(text, indent, end)
    : pairParts(text, indent, end);
  return consistent(parts, entry, text) ? located(table, lineNumber, parts) : undefined;
}

export function flowTokens(text) {
  return [...text.slice(1, -1).matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,]+/g)]
    .map(([token]) => token.trim())
    .filter((token) => token !== '');
}

export function parentLine(table, index) {
  const { indent } = indentOf(table[index]);
  const before = table.slice(0, index).map((line, at) => ({ line, at }));
  for (const { line, at } of before.reverse()) {
    const found = indentOf(line);
    if (found.structural && /^---/.test(line.text)) {
      return undefined;
    }
    if (found.structural && found.indent < indent) {
      return at;
    }
  }
  return undefined;
}

export function indentOf(line) {
  const content = line.text.slice(0, contentEnd(line.text));
  return {
    indent: line.text.length - line.text.trimStart().length,
    structural: content.trim() !== '',
    bare: /:\s*$/.test(content.trimEnd()) && !/^\s*-/.test(content),
  };
}

export function bareKeyAt(table, index) {
  const line = table[index];
  const parts = pairParts(line.text, indentOf(line).indent, contentEnd(line.text));
  return parts?.key === undefined ? undefined : absolute(parts.key, line.start);
}
