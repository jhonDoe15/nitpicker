import {
  closingIndex,
  inImport,
  literalAt,
  parenDepths,
  splitArguments,
} from '../kotlin-source.mjs';

const URI_RULE = 'UriCreateDynamic';

export const URI_MESSAGES = {
  [URI_RULE]:
    'Build the URI with an encoding builder (`UriComponentsBuilder.fromUriString(base).path(path).queryParam(name, value).encode().build().toUri()` with Spring, or `URI(scheme, host, path, fragment)`), or parse the text where the failure is handled: `runCatching { URI.create(text) }`, or a `try` that catches `IllegalArgumentException` (`URISyntaxException` for `URI(text)`). `URI.create(text)` and `URI(text)` throw on a space, a non-ASCII character or any other character that is not encoded, so one odd stored, user or header value turns this call into an error response. A constant is fine, and so is a project helper that does one of these. A value read from configuration at startup also matches, because a bad value fails only at runtime.',
};

const URI_IMPORT = /^[ \t]*import\s+java\.net\.(?:URI\b(?!\s+as\b)|\*)/m;
const CREATE = /(?<![\w.])(java\.net\.)?URI\s*\.\s*create\s*\(/g;
const CONSTRUCTOR = /(?<![\w.])(java\.net\.)?URI\s*\(/g;
const REFERENCE =
  /(?<![\w.])(java\.net\.)?URI\s*::\s*create\b|(?<![\w.:])::\s*(java\.net\.)?URI\b/g;
const DECLARED = /\b(?:fun|class|object|interface)\s+$/;
const CREATE_CAUGHT = new Set([
  'IllegalArgumentException',
  'RuntimeException',
  'Exception',
  'Throwable',
]);
const CONSTRUCTOR_CAUGHT = new Set(['URISyntaxException', 'Exception', 'Throwable']);
const TRY_BEFORE = /\btry\s*$/;
const RESULT_BEFORE = /(?<![\w.])(?:\w+\s*\??\.\s*)?runCatching\s*(?:\(\s*\)\s*)?$/;
const FUNCTION_BEFORE = /\bfun\b[^{};=]*\)\s*(?::[^{};=]+)?$/;
const CATCH_AFTER = /^\s*catch\s*\(\s*(?:[A-Za-z_]\w*|`[^`]+`)\s*:\s*([\w.]+)\s*\)\s*\{/;
const BRACES = /[{}]/g;
const HEADER_WINDOW = 1000;
const MODIFIER_WINDOW = 20;
const NAME = /^[A-Za-z_]\w*$/;
const QUALIFIED = /^(?:[A-Z]\w*\.)+([A-Z][A-Z0-9_]*)$/;
const SCREAMING = /^[A-Z][A-Z0-9_]*$/;

function trimmedPart(code, { start, end }) {
  const text = code.slice(start, end);
  const from = start + text.length - text.trimStart().length;
  return { start: from, end: from + text.trim().length };
}

function isPlainLiteral(scanned, part) {
  const literal = literalAt(scanned, part.start);
  return literal !== undefined && !literal.template && literal.end === part.end;
}

function innermostOpens(code) {
  const opens = new Int32Array(code.length + 1).fill(-1);
  const stack = [-1];
  let cursor = 0;
  for (const { index, 0: brace } of code.matchAll(BRACES)) {
    opens.fill(stack.at(-1), cursor, index + 1);
    cursor = index + 1;
    if (brace === '{') {
      stack.push(index);
    } else if (stack.length > 1) {
      stack.pop();
    }
  }
  opens.fill(stack.at(-1), cursor);
  return opens;
}

function plusOperands(file, part) {
  const { code } = file.scanned;
  const level = file.depths[part.start];
  const pluses = [...code.slice(part.start, part.end).matchAll(/\+/g)]
    .map(({ index }) => part.start + index)
    .filter((index) => file.depths[index] === level);
  const starts = [part.start, ...pluses.map((index) => index + 1)];
  const ends = [...pluses, part.end];
  return starts.map((start, index) => trimmedPart(code, { start, end: ends[index] }));
}

function isLiteralLine(scanned, at) {
  const literal = literalAt(scanned, at);
  if (literal === undefined || literal.template) {
    return false;
  }
  const newline = scanned.code.indexOf('\n', literal.end);
  const rest = scanned.code.slice(literal.end, newline === -1 ? undefined : newline).trim();
  return rest === '' || rest === ';';
}

function isParameterName(code, name) {
  const typed = new RegExp(String.raw`(?<![\w.])${name}\s*:(?!:)`, 'g');
  const declared = /\b(?:val|var)\s+$/;
  const lambda = new RegExp(String.raw`[{,]\s*${name}\s*(?:,[\w\s,]*)?->`);
  return (
    lambda.test(code) ||
    [...code.matchAll(typed)].some(
      ({ index }) => !declared.test(code.slice(Math.max(0, index - MODIFIER_WINDOW), index)),
    )
  );
}

function resolveName(scanned, name) {
  const { code } = scanned;
  const declared = new RegExp(
    String.raw`\b(?:(const)\s+)?(val|var)\s+${name}\b\s*(?::\s*[\w.?]+\s*)?(=(?!=)\s*)?`,
    'g',
  );
  const declarations = [...code.matchAll(declared)];
  if (declarations.length === 0) {
    return SCREAMING.test(name) && !isParameterName(code, name);
  }
  return (
    !isParameterName(code, name) &&
    declarations.every(
      (match) =>
        match[1] === 'const' ||
        (match[2] === 'val' &&
          match[3] !== undefined &&
          isLiteralLine(scanned, match.index + match[0].length)),
    )
  );
}

function isConstantName(file, name) {
  if (!file.names.has(name)) {
    file.names.set(name, resolveName(file.scanned, name));
  }
  return file.names.get(name);
}

function isConstantOperand(file, part) {
  const text = file.scanned.code.slice(part.start, part.end);
  const qualified = QUALIFIED.exec(text);
  return (
    isPlainLiteral(file.scanned, part) ||
    (qualified !== null && isConstantName(file, qualified[1])) ||
    (NAME.test(text) && isConstantName(file, text))
  );
}

function caughtTypes(code, tryOpen) {
  const types = [];
  const cursors = [closingIndex(code, tryOpen) + 1];
  for (const cursor of cursors) {
    const clause = CATCH_AFTER.exec(code.slice(cursor));
    if (clause !== null) {
      types.push(clause[1].split('.').at(-1));
      cursors.push(closingIndex(code, cursor + clause[0].length - 1) + 1);
    }
  }
  return types;
}

function isHandled(file, offset, caught) {
  const { code } = file.scanned;
  const opens = [file.opens[offset]];
  for (const open of opens) {
    if (open === -1) {
      return false;
    }
    opens.push(file.opens[open]);
    const before = code.slice(Math.max(0, open - HEADER_WINDOW), open);
    if (RESULT_BEFORE.test(before)) {
      return true;
    }
    if (TRY_BEFORE.test(before) && caughtTypes(code, open).some((type) => caught.has(type))) {
      return true;
    }
    if (FUNCTION_BEFORE.test(before)) {
      return false;
    }
  }
  return false;
}

function onlyArgument(code, match) {
  const { parts } = splitArguments(code, match.index + match[0].length - 1);
  return parts.length === 1 ? trimmedPart(code, parts[0]) : undefined;
}

function isSkipped(file, match) {
  const { code } = file.scanned;
  const qualified = match.slice(1).some((group) => group !== undefined);
  return (
    (!qualified && !file.imported) ||
    inImport(code, match.index) ||
    DECLARED.test(code.slice(Math.max(0, match.index - MODIFIER_WINDOW), match.index))
  );
}

function callsOf(file, pattern, caught) {
  const { code } = file.scanned;
  return [...code.matchAll(pattern)].flatMap((match) => {
    const argument = onlyArgument(code, match);
    return isSkipped(file, match) ||
      argument === undefined ||
      plusOperands(file, argument).every((operand) => isConstantOperand(file, operand)) ||
      isHandled(file, match.index, caught)
      ? []
      : [{ rule: URI_RULE, offset: match.index }];
  });
}

function referencesOf(file) {
  return [...file.scanned.code.matchAll(REFERENCE)].flatMap((match) =>
    isSkipped(file, match) ||
    isHandled(file, match.index, match[0].endsWith('create') ? CREATE_CAUGHT : CONSTRUCTOR_CAUGHT)
      ? []
      : [{ rule: URI_RULE, offset: match.index }],
  );
}

export function dynamicUris(scanned) {
  const file = {
    scanned,
    imported: URI_IMPORT.test(scanned.code),
    depths: parenDepths(scanned.code),
    opens: innermostOpens(scanned.code),
    names: new Map(),
  };
  return [
    ...callsOf(file, CREATE, CREATE_CAUGHT),
    ...callsOf(file, CONSTRUCTOR, CONSTRUCTOR_CAUGHT),
    ...referencesOf(file),
  ];
}
