const DEFINITION = /^\s*(?:async\s+)?def\s+(\w+)\s*\(/u;
const CLASS = /^\s*class\s+\w+/u;
const DECORATOR = /^\s*@/u;
const MARKS = /^\s*pytestmark\s*[:=]/u;
const OPENING = new Set(['(', '[', '{']);
const CLOSING = new Set([')', ']', '}']);
const QUOTES = new Set(['"', "'"]);

function indentOf(line) {
  return /^\s*/u.exec(line)[0].length;
}

function isBlank(line) {
  const text = line.trim();
  return text === '' || text.startsWith('#');
}

function quoteAt(line, index) {
  const tripled = line[index].repeat(3);
  return line.startsWith(tripled, index) ? tripled : line[index];
}

function insideString(line, state, index) {
  if (line[index] === '\\') {
    return index + 2;
  }
  if (line.startsWith(state.quote, index)) {
    const next = index + state.quote.length;
    state.quote = undefined;
    return next;
  }
  return index + 1;
}

function scanLine(line, state) {
  state.continued = false;
  let index = 0;
  while (index < line.length) {
    if (state.quote !== undefined) {
      index = insideString(line, state, index);
      continue;
    }
    const character = line[index];
    if (character === '#') {
      break;
    }
    if (QUOTES.has(character)) {
      state.quote = quoteAt(line, index);
      index += state.quote.length;
      continue;
    }
    state.depth += OPENING.has(character) ? 1 : 0;
    state.depth = Math.max(0, state.depth - (CLOSING.has(character) ? 1 : 0));
    state.continued = character === '\\' && index === line.length - 1;
    index += 1;
  }
  if (state.quote?.length === 1) {
    state.quote = undefined;
  }
}

function logicalLines(lines) {
  const state = { depth: 0, quote: undefined, continued: false };
  const logical = [];
  for (const [index, line] of lines.entries()) {
    const continues = state.depth > 0 || state.quote !== undefined || state.continued;
    if (continues && logical.length > 0) {
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
  let last = position;
  for (let next = position + 1; next < logical.length; next += 1) {
    if (!logical[next].blank) {
      if (logical[next].indent <= indent) {
        break;
      }
      last = next;
    }
  }
  return last;
}

function decoratorsAbove(source, position) {
  const { logical, lines } = source;
  const { indent } = logical[position];
  let first = position;
  for (let previous = position - 1; previous >= 0; previous -= 1) {
    const entry = logical[previous];
    if (!entry.blank) {
      if (entry.indent !== indent || !DECORATOR.test(lines[entry.first])) {
        break;
      }
      first = previous;
    }
  }
  return first;
}

function ownerOf(logical, position) {
  const { indent } = logical[position];
  for (let previous = position - 1; previous >= 0; previous -= 1) {
    if (!logical[previous].blank && logical[previous].indent < indent) {
      return previous;
    }
  }
  return undefined;
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
  let owner = ownerOf(source.logical, position);
  while (owner !== undefined) {
    if (CLASS.test(source.lines[source.logical[owner].first])) {
      const end = bodyEnd(source.logical, owner);
      marks.push(...decoratorText(source, owner), ...markLines(source, owner, end));
    }
    owner = ownerOf(source.logical, owner);
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
