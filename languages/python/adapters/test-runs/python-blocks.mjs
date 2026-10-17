const DEFINITION = /^\s*(?:async\s+)?def\s+(\w+)\s*\(/u;
const CLASS = /^\s*class\s+\w+/u;
const DECORATOR = /^\s*@/u;
const MARKS = /^\s*pytestmark\s*[:=]/u;
const TOKEN = /\\.?|"""|'''|["'#()[\]{}]/gu;
const QUOTES = new Set(['"', "'", '"""', "'''"]);
const DEPTH = { '(': 1, '[': 1, '{': 1, ')': -1, ']': -1, '}': -1 };
const COMMENT = '#';
const CONTINUATION = '\\';

function indentOf(line) {
  return /^\s*/u.exec(line)[0].length;
}

function isBlank(line) {
  const text = line.trim();
  return text === '' || text.startsWith(COMMENT);
}

function inString(token, state) {
  const closes =
    !token.startsWith(CONTINUATION) &&
    token.startsWith(state.quote[0]) &&
    (state.quote.length === 1 || token === state.quote);
  state.quote = closes ? undefined : state.quote;
}

function inCode(token, state, atEnd) {
  if (QUOTES.has(token)) {
    state.quote = token;
    return;
  }
  state.depth = Math.max(0, state.depth + (DEPTH[token] ?? 0));
  state.continued = token === CONTINUATION && atEnd;
}

function scanLine(line, state) {
  state.continued = false;
  for (const { 0: token, index } of line.matchAll(TOKEN)) {
    if (state.quote !== undefined) {
      inString(token, state);
    } else if (token === COMMENT) {
      break;
    } else {
      inCode(token, state, index + token.length === line.length);
    }
  }
  state.quote = state.quote?.length === 1 ? undefined : state.quote;
}

function logicalLines(lines) {
  const state = { depth: 0, quote: undefined, continued: false };
  const logical = [];
  for (const [index, line] of lines.entries()) {
    if (state.depth > 0 || state.quote !== undefined || state.continued) {
      logical.at(-1).last = index;
    } else {
      logical.push({ first: index, last: index, indent: indentOf(line), blank: isBlank(line) });
    }
    scanLine(line, state);
  }
  return logical;
}

function textOf(lines, first, last) {
  return lines.slice(first, last + 1).join('\n');
}

function bodyEnd(logical, position) {
  const { indent } = logical[position];
  const rest = logical.slice(position + 1);
  const end = rest.findIndex((entry) => !entry.blank && entry.indent <= indent);
  const body = end === -1 ? rest : rest.slice(0, end);
  return position + 1 + body.findLastIndex((entry) => !entry.blank);
}

function decoratorsAbove({ logical, lines }, position) {
  const { indent } = logical[position];
  const above = logical
    .slice(0, position)
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.blank)
    .reverse();
  const stop = above.findIndex(
    ({ entry }) => entry.indent !== indent || !DECORATOR.test(lines[entry.first]),
  );
  return (stop === -1 ? above : above.slice(0, stop)).at(-1)?.index ?? position;
}

function ownerOf(logical, position) {
  const { indent } = logical[position];
  const owner = logical
    .slice(0, position)
    .findLastIndex((entry) => !entry.blank && entry.indent < indent);
  return owner === -1 ? undefined : owner;
}

function markLines(source, from, to) {
  const { logical, lines } = source;
  const indent = logical
    .slice(from + 1, to + 1)
    .find((entry) => !entry.blank && entry.indent > logical[from].indent)?.indent;
  return logical
    .slice(from + 1, to + 1)
    .filter((entry) => entry.indent === indent && MARKS.test(lines[entry.first]))
    .map((entry) => textOf(lines, entry.first, entry.last));
}

function decoratorText(source, position) {
  const first = decoratorsAbove(source, position);
  const { logical, lines } = source;
  return first === position
    ? []
    : [textOf(lines, logical[first].first, logical[position].first - 1)];
}

function classMarks(source, position) {
  const marks = [];
  const owners = [ownerOf(source.logical, position)].filter((owner) => owner !== undefined);
  for (const owner of owners) {
    if (CLASS.test(source.lines[source.logical[owner].first])) {
      const end = bodyEnd(source.logical, owner);
      marks.push(...decoratorText(source, owner), ...markLines(source, owner, end));
    }
    owners.push(...[ownerOf(source.logical, owner)].filter((next) => next !== undefined));
  }
  return marks;
}

function moduleMarks({ logical, lines }) {
  return logical
    .filter((entry) => entry.indent === 0 && MARKS.test(lines[entry.first]))
    .map((entry) => textOf(lines, entry.first, entry.last));
}

function blockAt(source, position) {
  const { logical, lines } = source;
  const first = logical[decoratorsAbove(source, position)].first;
  const last = logical[bodyEnd(logical, position)].last;
  return {
    first,
    definition: logical[position].first,
    last,
    text: textOf(lines, first, last),
    marks: [
      ...decoratorText(source, position),
      ...classMarks(source, position),
      ...moduleMarks(source),
    ],
  };
}

export function functionBlocks(text, name) {
  const lines = text.split(/\r?\n/u);
  const source = { lines, logical: logicalLines(lines) };
  return source.logical.flatMap((entry, position) =>
    !entry.blank && DEFINITION.exec(lines[entry.first])?.[1] === name
      ? [blockAt(source, position)]
      : [],
  );
}
