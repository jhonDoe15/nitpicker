const PROFILE_KEYS = new Set(
  ['spring.config.activate.on-profile', 'spring.profiles'].map(relaxKey),
);

export function relaxKey(key) {
  return key.toLowerCase().replaceAll(/[-_]/g, '');
}

export function isProfileKey(key) {
  return PROFILE_KEYS.has(relaxKey(key));
}

export function parseProperties(text) {
  const entries = [];
  let pending;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const logical = pending === undefined ? raw.trimStart() : `${pending.text}${raw.trimStart()}`;
    const line = pending === undefined ? index + 1 : pending.line;
    if (!isCommentLine(logical) && hasContinuation(logical)) {
      pending = { text: logical.slice(0, -1), line };
    } else {
      pending = undefined;
      entries.push(propertyEntry(logical, line));
    }
  }
  if (pending !== undefined) {
    entries.push(propertyEntry(pending.text, pending.line));
  }
  return [{ entries: entries.filter((entry) => entry !== undefined) }];
}

function isCommentLine(line) {
  return line.startsWith('#') || line.startsWith('!');
}

function hasContinuation(line) {
  const trailing = /\\+$/.exec(line);
  return trailing !== null && trailing[0].length % 2 === 1;
}

function propertyEntry(logical, line) {
  if (logical === '' || isCommentLine(logical)) {
    return undefined;
  }
  const separator = /(?<!\\)[=:\s]/.exec(logical);
  const keyEnd = separator === null ? logical.length : separator.index;
  const key = unescapeProperty(logical.slice(0, keyEnd));
  const rest = logical.slice(keyEnd).replace(/^\s*[=:]?\s*/, '');
  return { key, value: unescapeProperty(rest.trim()), line, list: false };
}

function unescapeProperty(text) {
  return text.replaceAll(/\\(.)/g, '$1');
}

export function parseYaml(text) {
  const documents = [];
  let state = freshDocument();
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (/^---(\s|$)/.test(raw)) {
      documents.push({ entries: state.entries });
      state = freshDocument();
    } else {
      readYamlLine(state, raw, index + 1);
    }
  }
  documents.push({ entries: state.entries });
  return documents.filter((document) => document.entries.length > 0);
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
    state.entries.push({ key: state.pending, value: unquote(item), line, list: true });
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
  if (split.value === '') {
    state.stack.push({ indent, key: split.key });
    state.pending = key;
    return;
  }
  readScalar(state, { key, value: split.value, indent, line });
}

function readScalar(state, { key, value, indent, line }) {
  if (/^[|>]/.test(value)) {
    state.blockIndent = indent;
    return;
  }
  if (!value.startsWith('{')) {
    state.entries.push({ key, value: unquote(value), line, list: false });
  }
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
  return {
    key: unquote(content.slice(0, at).trim()),
    value: content.slice(at + 1).trim(),
  };
}

const QUOTED_OR_COMMENT = /(?<=^|[\s:[,{])(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')|(?<=^|\s)#/g;

function stripComment(raw) {
  for (const match of raw.matchAll(QUOTED_OR_COMMENT)) {
    if (match[0] === '#') {
      return raw.slice(0, match.index);
    }
  }
  return raw;
}

function unquote(text) {
  const quote = text[0];
  if ((quote === '"' || quote === "'") && text.length >= 2 && text.endsWith(quote)) {
    return text.slice(1, -1);
  }
  return text;
}
