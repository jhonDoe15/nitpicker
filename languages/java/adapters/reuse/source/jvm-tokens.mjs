const IDENTIFIER = /[\p{L}_$][\p{L}\p{N}_$]*|`[^`\n]+`/uy;
const NUMBER =
  /(?:0[xXbB][\w]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?|\.\d[\d_]*(?:[eE][+-]?\d+)?)[\w]*/uy;
const OPERATOR =
  /(?:>>>=|<<=|>>=|\.\.\.|===|!==|\.\.<|\?\.|\?:|::|->|==|!=|<=|>=|&&|\|\||\+\+|--|[+\-*/%&|^]=|!!|\.\.|<<|[^\s\w])/uy;
const CHARACTER = /'(?:\\(?:u[\da-fA-F]{4}|.)|[^'\\\n])*'/uy;
const RAW_QUOTES = '"""';
const BRACE_DEPTH = new Map([
  ['{', 1],
  ['}', -1],
]);

function match(pattern, source, index) {
  pattern.lastIndex = index;
  return pattern.exec(source)?.[0];
}

function lineComment(source, index) {
  const end = source.indexOf('\n', index);
  return end === -1 ? source.length : end;
}

function blockComment(source, index, kotlin) {
  let depth = 0;
  let position = index;
  while (position < source.length) {
    if (source.startsWith('/*', position)) {
      depth += kotlin || depth === 0 ? 1 : 0;
      position += 2;
    } else if (source.startsWith('*/', position)) {
      depth -= 1;
      position += 2;
      if (depth === 0) {
        return position;
      }
    } else {
      position += 1;
    }
  }
  return source.length;
}

function templateEnd(source, index) {
  let depth = 1;
  let position = index;
  while (position < source.length && depth > 0) {
    const skipped = skipLiteralOrComment(source, position, true);
    if (skipped > position) {
      position = skipped;
      continue;
    }
    depth += BRACE_DEPTH.get(source[position]) ?? 0;
    position += 1;
  }
  return position;
}

function stringEnd(source, index, { kotlin, raw }) {
  const quote = raw ? RAW_QUOTES : '"';
  let position = index + quote.length;
  while (position < source.length) {
    if (source.startsWith(quote, position)) {
      let end = position + quote.length;
      while (raw && source[end] === '"') {
        end += 1;
      }
      return end;
    }
    if (!raw && source[position] === '\n') {
      return position;
    }
    const escaped = source[position] === '\\' && (!raw || !kotlin);
    const template = kotlin && source.startsWith('${', position);
    position = escaped ? position + 2 : template ? templateEnd(source, position + 2) : position + 1;
  }
  return source.length;
}

function skipLiteralOrComment(source, index, kotlin) {
  if (source.startsWith('//', index)) {
    return lineComment(source, index);
  }
  if (source.startsWith('/*', index)) {
    return blockComment(source, index, kotlin);
  }
  if (source[index] === '"') {
    return stringEnd(source, index, { kotlin, raw: source.startsWith(RAW_QUOTES, index) });
  }
  return index;
}

function lineStarts(source) {
  return [0, ...[...source.matchAll(/\n/gu)].map(({ index }) => index + 1)];
}

function lineOf(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low + 1;
}

function nextToken(source, index, kotlin) {
  const literalEnd = skipLiteralOrComment(source, index, kotlin);
  if (literalEnd > index) {
    const kind = source[index] === '"' ? 'string' : 'comment';
    return { kind, end: literalEnd };
  }
  for (const [kind, pattern] of [
    ['identifier', IDENTIFIER],
    ['number', NUMBER],
    ['char', CHARACTER],
    ['operator', OPERATOR],
  ]) {
    const text = match(pattern, source, index);
    if (text !== undefined) {
      return { kind, end: index + text.length };
    }
  }
  return { kind: 'operator', end: index + 1 };
}

const TEMPLATE_NAME = /\$\{([^}]*)\}|\$([\p{L}_][\p{L}\p{N}_]*)/gu;
const NAME = /[\p{L}_$][\p{L}\p{N}_$]*/gu;

function templateNames(text) {
  return [...text.matchAll(TEMPLATE_NAME)].flatMap(([, code, name]) =>
    name === undefined ? (code.replaceAll(/"(?:\\.|[^"\\])*"/gu, ' ').match(NAME) ?? []) : [name],
  );
}

export function namesOf(token) {
  if (token.kind === 'identifier') {
    return [token.text];
  }
  return token.names ?? [];
}

export function tokenizeJvm(source, { kotlin = false } = {}) {
  const starts = lineStarts(source);
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    if (/\s/u.test(source[index])) {
      index += 1;
      continue;
    }
    const { kind, end } = nextToken(source, index, kotlin);
    if (kind !== 'comment') {
      const text = source.slice(index, end);
      const names = kotlin && kind === 'string' ? templateNames(text) : [];
      tokens.push({
        text,
        kind,
        line: lineOf(starts, index),
        ...(names.length === 0 ? {} : { names }),
      });
    }
    index = end;
  }
  return tokens;
}
