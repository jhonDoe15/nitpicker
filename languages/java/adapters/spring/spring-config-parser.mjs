const PROFILE_KEYS = new Set(
  ['spring.config.activate.on-profile', 'spring.profiles'].map(relaxKey),
);
const LINE_BREAK = /\r\n|\r|\n/;
const BOM = '﻿';
const PROPERTIES_DOCUMENT_MARK = /^\s*[#!]---\s*$/;
const PROPERTY_KEY = /^((?:\\.|[^\\=:\s])*)\s*[=:]?\s*/;
const PROPERTY_ESCAPE = /\\(?:u([0-9a-fA-F]{4})|(.))/g;
const PROPERTY_ESCAPES = { n: '\n', t: '\t', r: '\r', f: '\f' };
const NODE_PROPERTIES = /^(?:[&!]\S*(?:\s+|$))+/;
const FLOW_TOKEN = /"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[{}[\],]|[^"'{}[\],]+|./g;
const QUOTED_OR_COMMENT = /(?<=^|[\s:[,{])(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')|(?<=^|\s)#/g;

export function relaxKey(key) {
  return key
    .toLowerCase()
    .replaceAll(/\[\d+\]/g, '')
    .replaceAll(/[-_]/g, '');
}

export function isProfileKey(key) {
  return PROFILE_KEYS.has(relaxKey(key));
}

function splitLines(text) {
  return (text.startsWith(BOM) ? text.slice(1) : text).split(LINE_BREAK);
}

function keepDocuments(entryLists) {
  const kept = entryLists.filter((entries) => entries.length > 0);
  return (kept.length > 0 ? kept : [[]]).map((entries) => ({ entries }));
}

export function parseProperties(text) {
  const state = { documents: [[]], parts: [], line: 0 };
  for (const [index, raw] of splitLines(text).entries()) {
    readPropertiesLine(state, raw, index + 1);
  }
  flushProperty(state);
  return keepDocuments(state.documents);
}

function readPropertiesLine(state, raw, line) {
  const continued = state.parts.length > 0;
  if (!continued && PROPERTIES_DOCUMENT_MARK.test(raw)) {
    state.documents.push([]);
    return;
  }
  const piece = raw.trimStart();
  if (!continued && isCommentLine(piece)) {
    return;
  }
  state.line = continued ? state.line : line;
  if (hasContinuation(piece)) {
    state.parts.push(piece.slice(0, -1));
    return;
  }
  state.parts.push(piece);
  flushProperty(state);
}

function flushProperty(state) {
  if (state.parts.length === 0) {
    return;
  }
  const entry = propertyEntry(state.parts.join(''), state.line);
  state.parts = [];
  if (entry !== undefined) {
    state.documents.at(-1).push(entry);
  }
}

function isCommentLine(line) {
  return line.startsWith('#') || line.startsWith('!');
}

function hasContinuation(line) {
  return /(?<!\\)(?:\\\\)*\\$/.test(line);
}

function propertyEntry(logical, line) {
  if (logical === '') {
    return undefined;
  }
  const match = PROPERTY_KEY.exec(logical);
  return {
    key: unescapeProperty(match[1]),
    value: unescapeProperty(logical.slice(match[0].length).trim()),
    line,
    list: false,
  };
}

function unescapeProperty(text) {
  return text.replaceAll(PROPERTY_ESCAPE, (_, code, char) =>
    code === undefined
      ? (PROPERTY_ESCAPES[char] ?? char)
      : String.fromCodePoint(Number.parseInt(code, 16)),
  );
}

export function parseYaml(text) {
  const entryLists = [];
  let state = freshDocument();
  for (const [index, raw] of splitLines(text).entries()) {
    if (/^---(\s|$)/.test(raw)) {
      entryLists.push(state.entries);
      state = freshDocument();
    } else {
      readYamlLine(state, raw, index + 1);
    }
  }
  entryLists.push(state.entries);
  return keepDocuments(entryLists);
}

function freshDocument() {
  return { entries: [], stack: [], listIndent: undefined, blockIndent: undefined, pending: '' };
}

function readYamlLine(state, raw, line) {
  const indent = raw.length - raw.trimStart().length;
  if (state.blockIndent !== undefined) {
    if (raw.trim() === '' || indent > state.blockIndent) {
      return;
    }
    state.blockIndent = undefined;
  }
  const content = stripComment(raw).trim();
  if (content === '') {
    return;
  }
  const row = { content, indent, line };
  if (content === '-' || content.startsWith('- ')) {
    readListItem(state, row);
  } else if (state.listIndent === undefined || indent <= state.listIndent) {
    state.listIndent = undefined;
    readYamlPair(state, row);
  }
}

function readListItem(state, { content, indent, line }) {
  state.listIndent = indent;
  const item = content.slice(1).trim();
  if (state.pending !== '' && item !== '' && splitPair(item) === undefined) {
    state.entries.push({ key: state.pending, value: scalarValue(item), line, list: true });
  }
}

function readYamlPair(state, { content, indent, line }) {
  const split = splitPair(content);
  if (split === undefined) {
    return;
  }
  const parents = enclosingKeys(state.stack, indent);
  state.stack = parents;
  state.pending = '';
  const key = [...parents.map((parent) => parent.key), split.key].join('.');
  const value = withoutNodeProperties(split.value);
  if (value === '') {
    state.stack.push({ indent, key: split.key });
    state.pending = key;
    return;
  }
  readScalar(state, { key, value, indent, line });
}

function readScalar(state, { key, value, indent, line }) {
  state.blockIndent = indent;
  if (!/^[|>]/.test(value) && !isOpenFlow(value) && !isOpenQuote(value)) {
    state.entries.push(...flowEntries(key, value, line));
  }
}

function isOpenFlow(value) {
  return (
    (value.startsWith('{') && !value.endsWith('}')) ||
    (value.startsWith('[') && !value.endsWith(']'))
  );
}

function isOpenQuote(value) {
  if (value.startsWith('"')) {
    return !/^"(?:[^"\\]|\\.)*"$/.test(value);
  }
  return value.startsWith("'") && !/^'(?:[^']|'')*'$/.test(value);
}

function flowEntries(key, value, line) {
  if (value.startsWith('[')) {
    return flowItems(value)
      .filter((item) => !/^[[{]/.test(item))
      .map((item) => ({ key, value: scalarValue(item), line, list: true }));
  }
  if (value.startsWith('{')) {
    return flowItems(value).flatMap((item) => flowPairEntries(key, item, line));
  }
  return [{ key, value: scalarValue(value), line, list: false }];
}

function flowPairEntries(parent, item, line) {
  const pair = splitPair(item);
  const value = pair === undefined ? '' : withoutNodeProperties(pair.value);
  return value === '' ? [] : flowEntries(`${parent}.${pair.key}`, value, line);
}

function flowItems(value) {
  const parts = [''];
  let depth = 0;
  for (const [token] of value.slice(1, -1).matchAll(FLOW_TOKEN)) {
    depth += depthChange(token);
    if (token === ',' && depth === 0) {
      parts.push('');
    } else {
      parts[parts.length - 1] += token;
    }
  }
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

function depthChange(token) {
  if (token === '{' || token === '[') {
    return 1;
  }
  return token === '}' || token === ']' ? -1 : 0;
}

function enclosingKeys(stack, indent) {
  return stack.filter((parent) => parent.indent < indent);
}

function splitPair(content) {
  const quote = content[0] === '"' || content[0] === "'" ? content[0] : undefined;
  let from = 0;
  if (quote !== undefined) {
    const close = content.indexOf(quote, 1);
    from = close < 0 ? 0 : close;
  }
  const colon = /:(\s|$)/.exec(content.slice(from));
  if (colon === null) {
    return undefined;
  }
  const at = from + colon.index;
  const key = unquote(content.slice(0, at).trim());
  return key === '' ? undefined : { key, value: content.slice(at + 1).trim() };
}

function stripComment(raw) {
  for (const match of raw.matchAll(QUOTED_OR_COMMENT)) {
    if (match[0] === '#') {
      return raw.slice(0, match.index);
    }
  }
  return raw;
}

function withoutNodeProperties(text) {
  return text.replace(NODE_PROPERTIES, '');
}

function scalarValue(text) {
  return unquote(withoutNodeProperties(text.trim()));
}

function unquote(text) {
  const quote = text[0];
  if ((quote === '"' || quote === "'") && text.length >= 2 && text.endsWith(quote)) {
    return text.slice(1, -1);
  }
  return text;
}
