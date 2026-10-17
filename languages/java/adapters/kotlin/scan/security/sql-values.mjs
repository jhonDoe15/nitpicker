import { literalAt, splitArguments } from '../kotlin-source.mjs';

export const DYNAMIC = '\u0000';
const TEMPLATE_TOKEN = /\\[\s\S]|\$\{|\$[A-Za-z_]\w*|[{}]/g;
const RAW_TEMPLATE_TOKEN = /\$\{|\$[A-Za-z_]\w*|[{}]/g;
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b' };
const NUMBER = /^-?\d[\d_]*(?:\.\d+)?[LlFfUu]?$/;
const CONSTANT = /^(?:[A-Za-z_]\w*\.)*[A-Z][A-Z0-9_]*$/;
const MEASURE = /\.\s*(?:size|length|ordinal|lastIndex|count\s*\(\s*\))$/;
const ARITHMETIC = /^[A-Za-z_]\w*\s*[-+*/%]\s*\d+$/;
const PLAIN_LITERAL = /^"([^"$\\]*)"$|^'(?:\\.|[^'\\])'$/;
const PLACEHOLDER_TEXT = /^[?,\s()]+$/;
const SEPARATOR = String.raw`(?:\(\s*(?:"[^"$\\]*"\s*)?\))?`;
const PLACEHOLDER_FORMS = [
  new RegExp(
    String.raw`\.\s*joinToString\s*${SEPARATOR}\s*\{\s*(?:[\w\s,]+->\s*)?"([^"$\\]*)"\s*\}$`,
  ),
  new RegExp(
    String.raw`^List\s*\([^()]*\)\s*\{\s*"([^"$\\]*)"\s*\}\s*\.\s*joinToString\s*${SEPARATOR}$`,
  ),
  /^"([^"$\\]*)"\s*\.\s*repeat\s*\([^()]*\)(?:\s*\.\s*(?:dropLast|removeSuffix|trimEnd)\s*\([^()]*\))*$/,
];
const JOINED = /^([A-Za-z_]\w*)\s*\.\s*joinToString\s*\(\s*"[^"$\\]*"\s*\)$/;
const LITERAL_LIST = /^(?:mutableListOf|arrayListOf)\s*(?:<\s*String\s*>)?\s*\(/;
const LIST_USE = /^\s*(?:\.\s*(?:add\s*\(|joinToString\b|isEmpty\b|isNotEmpty\b|size\b)|\+=)/;
const CONDITIONAL_LITERAL = /^if\s*\(.*\)\s*"\s*"\s*else\s*"\s*"$/;
const INERT_TYPES = new Set([
  'Int',
  'Long',
  'Short',
  'Byte',
  'Double',
  'Float',
  'Boolean',
  'UInt',
  'ULong',
  'BigDecimal',
  'BigInteger',
  'UUID',
  'LocalDate',
  'LocalDateTime',
  'LocalTime',
  'Instant',
  'OffsetDateTime',
  'ZonedDateTime',
]);
const ENUM = /\benum\s+class\s+([A-Z]\w*)/g;
const PROPERTY = /\b(?:val|var)\s+([A-Za-z_]\w*)\s*:\s*([A-Za-z_][\w.]*)/g;

function unescaped(text, raw) {
  return raw
    ? text
    : text.replaceAll(/\\([\s\S])/g, (_, character) => ESCAPES[character] ?? character);
}

export function templatePieces(literal) {
  const { text, raw } = literal;
  const pieces = [];
  const state = { cursor: 0, open: -1, depth: 0 };
  function pushText(end) {
    pieces.push({ text: unescaped(text.slice(state.cursor, end), raw) });
  }
  for (const { index, 0: token } of text.matchAll(raw ? RAW_TEMPLATE_TOKEN : TEMPLATE_TOKEN)) {
    if (state.open !== -1) {
      if (token === '}' && state.depth === 0) {
        pieces.push({ expression: text.slice(state.open, index).trim() });
        state.cursor = index + 1;
        state.open = -1;
      } else if (token === '}' || token === '{' || token === '${') {
        state.depth += token === '}' ? -1 : 1;
      }
    } else if (token === '${') {
      pushText(index);
      state.open = index + 2;
    } else if (token.startsWith('$')) {
      pushText(index);
      pieces.push({ expression: token.slice(1) });
      state.cursor = index + token.length;
    }
  }
  pushText(text.length);
  return pieces;
}

export function kotlinDeclarations(scannedFiles) {
  const enums = new Set();
  const properties = new Map();
  for (const { code } of scannedFiles) {
    for (const [, name] of code.matchAll(ENUM)) {
      enums.add(name);
    }
    for (const [, name, type] of code.matchAll(PROPERTY)) {
      properties.set(name, [...(properties.get(name) ?? []), type.split('.').at(-1)]);
    }
  }
  return { enums, properties };
}

function isInertType(type, declarations) {
  return INERT_TYPES.has(type) || declarations.enums.has(type);
}

function placeholders(expression) {
  return PLACEHOLDER_FORMS.some((form) => PLACEHOLDER_TEXT.test(form.exec(expression)?.[1] ?? ''));
}

function initializerAt(scanned, offset) {
  const newline = scanned.code.indexOf('\n', offset);
  const end = newline === -1 ? scanned.code.length : newline;
  return {
    code: scanned.code.slice(offset, end).trim(),
    source: scanned.source.slice(offset, end).trim(),
    literal: literalAt(scanned, offset),
  };
}

function isInertInitializer(scanned, offset, context) {
  const initializer = initializerAt(scanned, offset);
  const { literal } = initializer;
  if (literal !== undefined && initializer.code.length === literal.end - literal.start) {
    return !literal.template;
  }
  if (CONDITIONAL_LITERAL.test(initializer.code.replaceAll(/"[^"]*"/g, '""'))) {
    return initializer.source.match(/"[^"]*"/g).every((text) => !text.includes('$'));
  }
  return isInertExpression(initializer.source, scanned, context);
}

function nameDeclarations(scanned, name) {
  const typed = [
    ...scanned.code.matchAll(
      new RegExp(String.raw`(?<![\w.])${name}\s*:\s*([A-Za-z_][\w.]*)`, 'g'),
    ),
  ];
  const assigned = [
    ...scanned.code.matchAll(
      new RegExp(String.raw`\b(?:val|var)\s+${name}\s*(?::\s*[\w.<>?]+\s*)?=(?!=)\s*`, 'g'),
    ),
  ];
  return { typed: typed.map((match) => match[1].split('.').at(-1)), assigned };
}

function isInertName(name, scanned, context) {
  const { typed, assigned } = nameDeclarations(scanned, name);
  if (typed.length > 0) {
    return typed.every((type) => isInertType(type, context.declarations));
  }
  return (
    assigned.length > 0 &&
    assigned.every((match) =>
      isInertInitializer(scanned, match.index + match[0].length, {
        ...context,
        seen: [...context.seen, name],
      }),
    )
  );
}

function isLiteralArgument(scanned, part) {
  const text = scanned.code.slice(part.start, part.end);
  const offset = part.start + text.length - text.trimStart().length;
  const literal = literalAt(scanned, offset);
  return literal !== undefined && !literal.template && literal.end - offset === text.trim().length;
}

function appendsLiteral(scanned, offset, after) {
  const appended = /^\s*\+=\s*/.exec(after);
  if (appended === null) {
    return true;
  }
  const start = offset + appended[0].length;
  const newline = scanned.code.indexOf('\n', start);
  return isLiteralArgument(scanned, { start, end: newline === -1 ? scanned.code.length : newline });
}

function isLiteralList(name, scanned) {
  const uses = [...scanned.code.matchAll(new RegExp(String.raw`(?<![\w.])${name}\b`, 'g'))];
  const declared = new RegExp(String.raw`\b(?:val|var)\s+$`);
  return uses.every(({ index }) => {
    const after = scanned.code.slice(index + name.length);
    if (declared.test(scanned.code.slice(0, index))) {
      const open = index + name.length + after.indexOf('(');
      const initializer = /^\s*=\s*(.*)/.exec(after)?.[1] ?? '';
      return (
        LITERAL_LIST.test(initializer) &&
        splitArguments(scanned.code, open).parts.every((part) => isLiteralArgument(scanned, part))
      );
    }
    if (!LIST_USE.test(after)) {
      return false;
    }
    const call = /^\s*\.\s*add\s*\(/.exec(after);
    if (call === null) {
      return appendsLiteral(scanned, index + name.length, after);
    }
    const { parts } = splitArguments(scanned.code, index + name.length + call[0].length - 1);
    return parts.length === 1 && isLiteralArgument(scanned, parts[0]);
  });
}

function isInertMember(expression, context) {
  const [base, ...members] = expression.split(/\s*\??\.\s*/);
  const property = members.at(-1);
  const types = context.declarations.properties.get(property) ?? [];
  const baseTypes = nameDeclarations(context.scanned, base).typed;
  return (
    (baseTypes.length > 0 && baseTypes.every((type) => context.declarations.enums.has(type))) ||
    (types.length > 0 && types.every((type) => isInertType(type, context.declarations)))
  );
}

export function isInertExpression(expression, scanned, context) {
  const shared = { ...context, scanned, seen: context.seen ?? [] };
  const joined = JOINED.exec(expression);
  if (
    NUMBER.test(expression) ||
    PLAIN_LITERAL.test(expression) ||
    CONSTANT.test(expression) ||
    MEASURE.test(expression) ||
    ARITHMETIC.test(expression) ||
    placeholders(expression)
  ) {
    return true;
  }
  if (joined !== null) {
    return isLiteralList(joined[1], scanned);
  }
  if (/^[A-Za-z_]\w*$/.test(expression)) {
    return !shared.seen.includes(expression) && isInertName(expression, scanned, shared);
  }
  return (
    /^[A-Za-z_]\w*(?:\s*\??\.\s*[A-Za-z_]\w*)+$/.test(expression) &&
    isInertMember(expression, shared)
  );
}

export function classifiedPieces(pieces, scanned, context) {
  return pieces.map((piece) => {
    if (piece.text !== undefined) {
      return piece;
    }
    const literal = PLAIN_LITERAL.exec(piece.expression);
    if (literal !== null) {
      return { text: literal[1] ?? DYNAMIC };
    }
    return isInertExpression(piece.expression, scanned, context)
      ? { text: DYNAMIC }
      : { runtime: true };
  });
}
