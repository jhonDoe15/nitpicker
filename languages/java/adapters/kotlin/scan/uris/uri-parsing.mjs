import {
  closingIndex,
  enclosingOpen,
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
const DECLARED = /\b(?:fun|class|object|interface)\s+$/;
const CREATE_CAUGHT = new Set([
  'IllegalArgumentException',
  'RuntimeException',
  'Exception',
  'Throwable',
]);
const CONSTRUCTOR_CAUGHT = new Set(['URISyntaxException', 'Exception', 'Throwable']);
const TRY_BEFORE = /\btry\s*$/;
const RESULT_BEFORE = /(?<![\w.])(?:\w+\s*\??\.\s*)?runCatching\s*$/;
const FUNCTION_BEFORE = /\bfun\b[^{};=]*\)\s*(?::[^{};=]+)?$/;
const CATCH_AFTER = /^\s*catch\s*\(\s*(?:[A-Za-z_]\w*|`[^`]+`)\s*:\s*([\w.]+)\s*\)\s*\{/;
const NAME = /^[A-Za-z_]\w*$/;
const QUALIFIED_CONSTANT = /^(?:[A-Za-z_]\w*\.)+[A-Z][A-Z0-9_]*$/;
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

function declarationsOf(code, name) {
  const declared = new RegExp(
    String.raw`\b(?:(const)\s+)?(?:val|var)\s+${name}\b\s*(?::\s*[\w.?]+\s*)?(=(?!=)\s*)?`,
    'g',
  );
  return [...code.matchAll(declared)].map((match) => ({
    constant: match[1] === 'const',
    value: match[2] === undefined ? -1 : match.index + match[0].length,
  }));
}

function isConstantValue(scanned, at) {
  const literal = literalAt(scanned, at);
  if (literal === undefined || literal.template) {
    return false;
  }
  const newline = scanned.code.indexOf('\n', literal.end);
  const rest = scanned.code.slice(literal.end, newline === -1 ? undefined : newline).trim();
  return rest === '' || rest === ';';
}

function isConstantName(scanned, name) {
  const declarations = declarationsOf(scanned.code, name);
  if (declarations.length === 0) {
    return SCREAMING.test(name);
  }
  return declarations.every(
    ({ constant, value }) => constant || (value !== -1 && isConstantValue(scanned, value)),
  );
}

function isConstantOperand(scanned, part) {
  const text = scanned.code.slice(part.start, part.end);
  return (
    isPlainLiteral(scanned, part) ||
    QUALIFIED_CONSTANT.test(text) ||
    (NAME.test(text) && isConstantName(scanned, text))
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

function isHandled(code, offset, caught) {
  const opens = [enclosingOpen(code, offset)];
  for (const open of opens) {
    if (open === -1) {
      return false;
    }
    opens.push(enclosingOpen(code, open));
    const before = code.slice(0, open);
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

function callsOf(file, pattern, caught) {
  const { scanned, imported } = file;
  const { code } = scanned;
  return [...code.matchAll(pattern)].flatMap((match) => {
    const argument = onlyArgument(code, match);
    const skipped =
      (match[1] === undefined && !imported) ||
      inImport(code, match.index) ||
      DECLARED.test(code.slice(0, match.index)) ||
      argument === undefined;
    return skipped ||
      plusOperands(file, argument).every((operand) => isConstantOperand(scanned, operand)) ||
      isHandled(code, match.index, caught)
      ? []
      : [{ rule: URI_RULE, offset: match.index }];
  });
}

export function dynamicUris(scanned) {
  const file = {
    scanned,
    imported: URI_IMPORT.test(scanned.code),
    depths: parenDepths(scanned.code),
  };
  return [
    ...callsOf(file, CREATE, CREATE_CAUGHT),
    ...callsOf(file, CONSTRUCTOR, CONSTRUCTOR_CAUGHT),
  ];
}
