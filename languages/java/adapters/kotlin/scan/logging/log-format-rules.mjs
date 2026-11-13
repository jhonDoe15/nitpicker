import { literalAt, literalsIn, splitArguments } from '../kotlin-source.mjs';
import { templatePieces } from '../security/sql-values.mjs';
import {
  IDENTIFIER,
  declaredTypes,
  formatCalls,
  isThrowable,
  soleType,
} from './log-format-calls.mjs';
import { messageFormat, printfFormat, wrongConversion } from './log-formats.mjs';

const ARGUMENTS_RULE = 'LogFormatArguments';
const EXCEPTION_RULE = 'LogExceptionFirst';

const LOG_FORMAT_MESSAGES = {
  [ARGUMENTS_RULE]:
    "Pass one argument per placeholder, in the method's own syntax: `%s` for printf methods (JBoss Logging `infof`, Log4j 2 `printf` and formatter loggers), `{0}` for MessageFormat methods (JBoss Logging `infov`, `java.util.logging` `log`), with `''` for an apostrophe there. Keep the format a constant, not a string template. Otherwise values are dropped or the call throws.",
  [EXCEPTION_RULE]:
    'Pass the exception first (`log.errorf(e, "Cannot read %s", path)`), or `e.message` when only the text is wanted. After the format, JBoss Logging never logs its stack trace.',
};

const CONCATENATION_COVERED = new Set(['info', 'warn', 'error', 'log']);
const TRIMMED = /\.\s*trim(?:Indent|Margin)\(\)$/u;
const CONSTANT_NAME = /^(?:[A-Za-z_]\w*\.)*[A-Z][A-Z0-9_]*$/u;
const ARRAY_OF = /^arrayOf\b/u;
const STRING_LITERAL = /^"(?:[^"\\]|\\.)*"$|^"""[\s\S]*"""$|^'(?:[^'\\]|\\.)+'$/u;
const PLAIN_VALUE = /^(?:[A-Za-z_]\w*(?:\s*\??\.\s*[A-Za-z_]\w*)*|-?\d[\w.]*|"[^"$]*")$/u;
const KINDS = [
  { kind: 'text', literal: /^(?:true|false)$/u, types: ['String', 'Boolean', 'Char'] },
  {
    kind: 'decimal',
    literal: /^-?\d[\d_]*(?:\.\d[\d_]*[fF]?|[fF])$/u,
    types: ['Double', 'Float', 'BigDecimal'],
  },
  {
    kind: 'integral',
    literal: /^-?\d[\d_]*[lL]?$/u,
    types: ['Int', 'Long', 'Short', 'Byte', 'BigInteger'],
  },
];

export function operands(code, { start, end }) {
  const parts = [];
  let depth = 0;
  let from = start;
  for (const { index, 0: mark } of code.slice(start, end).matchAll(/[()[\]{}+]/gu)) {
    if (mark === '+' && depth === 0) {
      parts.push({ start: from, end: start + index });
      from = start + index + 1;
    } else if (mark !== '+') {
      depth += '([{'.includes(mark) ? 1 : -1;
    }
  }
  return [...parts, { start: from, end }];
}

function literalValue(literal) {
  const pieces = templatePieces(literal);
  return pieces.some(({ expression }) => expression !== undefined)
    ? { dynamic: true, template: true }
    : { text: pieces.map(({ text }) => text).join('') };
}

function constantValue(scanned, name) {
  const declared = new RegExp(String.raw`\bconst\s+val\s+${name}\s*(?::\s*String\s*)?=\s*`, 'gu');
  const [match, ...others] = [...scanned.code.matchAll(declared)];
  const literal =
    match === undefined ? undefined : literalAt(scanned, match.index + match[0].length);
  return others.length === 0 && literal !== undefined ? literalValue(literal) : { unknown: true };
}

function operandValue(scanned, operand) {
  const source = scanned.source.slice(operand.start, operand.end);
  const text = source.trim().replace(TRIMMED, '');
  const start = operand.start + source.length - source.trimStart().length;
  const literal = literalAt(scanned, start);
  if (literal !== undefined && literal.end === start + text.length) {
    return literalValue(literal);
  }
  if (IDENTIFIER.test(text) && /\bconst\s+val\b/u.test(scanned.code)) {
    const constant = constantValue(scanned, text);
    if (constant.unknown !== true) {
      return constant;
    }
  }
  return CONSTANT_NAME.test(text) ? { unknown: true } : { dynamic: true };
}

function formatValue(scanned, part) {
  const values = operands(scanned.code, part).map((operand) => operandValue(scanned, operand));
  if (values.length === 1 && values[0].dynamic === true && values[0].template !== true) {
    return { unknown: true };
  }
  if (values.some(({ dynamic }) => dynamic === true)) {
    return { dynamic: true };
  }
  return values.some(({ unknown }) => unknown === true)
    ? { unknown: true }
    : { text: values.map(({ text }) => text).join('') };
}

function argumentKind(code, text) {
  if (STRING_LITERAL.test(text)) {
    return 'text';
  }
  const type = IDENTIFIER.test(text) ? soleType(code, text)?.split('.').at(-1) : undefined;
  return KINDS.find(({ literal, types: named }) => literal.test(text) || named.includes(type))
    ?.kind;
}

function unbalancedAngles(text) {
  return text.split('<').length !== text.split('>').length;
}

function julValues(scanned, call) {
  const [parameter] = call.rest;
  if (parameter === undefined || isThrowable(scanned.code, parameter)) {
    return [];
  }
  if (ARRAY_OF.test(parameter)) {
    const open = scanned.code.indexOf('(', call.restParts[0].start);
    return splitArguments(scanned.code, open).parts.map(({ start, end }) =>
      scanned.source.slice(start, end).trim(),
    );
  }
  return PLAIN_VALUE.test(parameter) && !declaredTypes(scanned.code, parameter).has('Array')
    ? [parameter]
    : undefined;
}

function valuesOf(scanned, call) {
  const { code } = scanned;
  if (call.rest.some((text) => text.startsWith('*') || unbalancedAngles(text))) {
    return undefined;
  }
  if (call.api === 'jul') {
    return julValues(scanned, call);
  }
  return !call.formats && call.rest.length === 1 && isThrowable(code, call.rest[0])
    ? []
    : call.rest;
}

function countMismatch({ code, call, values }, parsed) {
  const { required } = parsed;
  if (call.api === 'log4j' && !call.formats && values.length === 0) {
    return parsed.conversions.length > 0;
  }
  const trailing =
    call.api === 'log4j' && values.length === required + 1 && isThrowable(code, values.at(-1));
  const plain = call.api === 'jboss' ? values.filter((text) => !isThrowable(code, text)) : values;
  return values.length !== required && plain.length !== required && !trailing;
}

function mismatched(checked, text) {
  const { code, call, values } = checked;
  const parsed = call.printf ? printfFormat(text) : messageFormat(text);
  const formats = !call.printf || call.formats || values.length > 0;
  return (
    (formats && parsed.malformed) ||
    (values.length > 0 && parsed.otherSyntax) ||
    countMismatch(checked, parsed) ||
    parsed.conversions.some(
      ({ argument, conversion }) =>
        values[argument - 1] !== undefined &&
        wrongConversion(conversion, argumentKind(code, values[argument - 1])),
    )
  );
}

function argumentsFinding(scanned, call) {
  const value = formatValue(scanned, call.format);
  if (value.dynamic === true) {
    return (
      literalsIn(scanned, call.format.start, call.format.end).length > 0 &&
      (call.api === 'jboss' || !CONCATENATION_COVERED.has(call.method))
    );
  }
  const values = valuesOf(scanned, call);
  return (
    value.text !== undefined &&
    values !== undefined &&
    mismatched({ code: scanned.code, call, values }, value.text)
  );
}

export function logFormatArguments(scanned) {
  return formatCalls(scanned).flatMap((call) => [
    ...(argumentsFinding(scanned, call) ? [{ rule: ARGUMENTS_RULE, offset: call.start }] : []),
    ...(call.api === 'jboss' && call.rest.some((text) => isThrowable(scanned.code, text))
      ? [{ rule: EXCEPTION_RULE, offset: call.start }]
      : []),
  ]);
}

export const kotlinSourceRules = { messages: LOG_FORMAT_MESSAGES, main: [logFormatArguments] };
