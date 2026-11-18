import { frameAt } from '../../max-value-sums/source-file.mjs';
import { isDiagnosticText, numericNames } from './context.mjs';
import { isOperator, methodCalls, stringValue } from '../calls.mjs';

const TAGS =
  'a|b|body|br|button|code|div|em|form|h[1-6]|head|hr|html|i|iframe|img|input|label|li|link|meta|ol|' +
  'option|p|pre|script|section|select|small|span|strong|style|svg|table|tbody|td|textarea|th|thead|' +
  'title|tr|u|ul';
const MARKUP = new RegExp(`(?<![\\w)\\]])</?(?:${TAGS})(?=[\\s>/]|$|\\\\)`, 'u');
const SAFE = /escape|encode|sanitize|html|quote|clean/iu;
const NUMBERS = /^(?:length|size|count|toInt|toLong|ordinal)$/u;
const TEMPLATE_PART = /\$\{([^}]*)\}|\$([\p{L}_][\p{L}\p{N}_]*)/gu;
const TEXT_VERBS = /%(?:\d+\$)?[-+# 0,(]*(?:\d+)?(?:\.\d+)?([a-zA-Z%])/gu;

function isMarkupToken(token) {
  return token.kind === 'string' && MARKUP.test(token.text);
}

function isSafeTokens(tokens, numbers) {
  const words = tokens.map(({ text }) => text);
  if (tokens.length === 1 && ['number', 'char'].includes(tokens[0].kind)) {
    return true;
  }
  if (tokens.length === 1 && numbers.has(tokens[0].text)) {
    return true;
  }
  if (tokens.length === 1 && tokens[0].kind === 'string') {
    return tokens[0].names === undefined || tokens[0].names.length === 0;
  }
  return words.some((word) => SAFE.test(word) || NUMBERS.test(word));
}

function operandsOf(source, { from, to }) {
  const operands = [];
  let start = from;
  const { tokens, partner } = source;
  for (let index = from; index < to; index += 1) {
    if (isOperator(tokens[index], ['+']) && !tokens[index + 1]?.text?.startsWith('+')) {
      operands.push({ from: start, to: index });
      start = index + 1;
    } else if (partner[index] > index) {
      index = partner[index];
    }
  }
  return [...operands, { from: start, to }];
}

function expressionAround(source, index) {
  const { tokens, opener, partner } = source;
  const boundary = opener[index];
  const from = boundary + 1;
  const to = boundary >= 0 && partner[boundary] > boundary ? partner[boundary] : tokens.length;
  const stops = new Set([',', ';', '=', 'return', '{', '}']);
  let start = index;
  let end = index + 1;
  while (start > from && !(stops.has(tokens[start - 1].text) && opener[start - 1] === boundary)) {
    start -= 1;
  }
  while (end < to && !(stops.has(tokens[end].text) && opener[end] === boundary)) {
    end += 1;
  }
  return { from: start, to: end };
}

function concatenationFinding(source, index) {
  const span = expressionAround(source, index);
  const operands = operandsOf(source, span);
  if (
    operands.length < 2 ||
    !operands.some(({ from, to }) => to - from === 1 && isMarkupToken(source.tokens[from]))
  ) {
    return undefined;
  }
  const numbers = numericNames(source);
  const bad = operands.find(
    (operand) =>
      !isSafeTokens(source.tokens.slice(operand.from, operand.to), numbers) &&
      operand.to - operand.from > 0,
  );
  return bad === undefined ? undefined : { span, bad };
}

function lastSegment(code) {
  return code.trim().replace(/\(\)$/u, '').split(/\??\./u).pop();
}

function templateFinding(token, numbers) {
  if (!isMarkupToken(token) || token.names === undefined || token.names.length === 0) {
    return undefined;
  }
  const parts = [...token.text.matchAll(TEMPLATE_PART)];
  const bad = parts.find(
    ([, code, name]) =>
      !numbers.has(name ?? code?.trim()) &&
      (name !== undefined || !(SAFE.test(code) || NUMBERS.test(lastSegment(code)))),
  );
  return bad === undefined ? undefined : (bad[1] ?? bad[2]);
}

function formatFindings(source, call) {
  const [format, ...values] = call.args;
  const token = format === undefined ? undefined : source.tokens[format.from];
  const direct =
    call.name === 'format' && token?.kind === 'string' && format.to - format.from === 1;
  const owner = source.tokens[call.dot - 1];
  const formatted = call.name === 'formatted' && owner?.kind === 'string';
  const pattern = direct ? token : formatted ? owner : undefined;
  const list = direct ? values : call.args;
  if (pattern === undefined || !isMarkupToken(pattern)) {
    return [];
  }
  const verbs = [...(stringValue(pattern) ?? '').matchAll(TEXT_VERBS)].filter(
    ([, verb]) => verb !== '%' && verb !== 'n',
  );
  return verbs.flatMap(([, verb], position) => {
    const argument = list[position];
    const tokens = argument === undefined ? [] : source.tokens.slice(argument.from, argument.to);
    return argument !== undefined &&
      'sS'.includes(verb) &&
      !isSafeTokens(tokens, numericNames(source))
      ? [
          {
            line: call.line,
            value: tokens
              .map(({ text }) => text)
              .join('')
              .slice(0, 40),
          },
        ]
      : [];
  });
}

function ownerAt(source, at) {
  return frameAt(source, at)?.name;
}

function markupFindings(source, index, seen) {
  const token = source.tokens[index];
  const owner = ownerAt(source, index);
  const found = [];
  const template = source.kotlin ? templateFinding(token, numericNames(source)) : undefined;
  if (template !== undefined) {
    found.push({ line: token.line, value: template.slice(0, 40), owner });
  }
  const concat = concatenationFinding(source, index);
  if (concat !== undefined && !seen.has(concat.span.from)) {
    seen.add(concat.span.from);
    const words = source.tokens.slice(concat.bad.from, concat.bad.to).map(({ text }) => text);
    found.push({ line: token.line, value: words.join('').slice(0, 40), owner });
  }
  return found;
}

function formatMarkup(source) {
  return methodCalls(source, ['format', 'formatted'])
    .filter((call) => !isDiagnosticText(source, call.open))
    .flatMap((call) =>
      formatFindings(source, call).map((hit) => ({ ...hit, owner: ownerAt(source, call.open) })),
    );
}

export function findUnescapedMarkup(source) {
  const seen = new Set();
  const found = [];
  for (const [index, token] of source.tokens.entries()) {
    if (token.kind === 'string' && isMarkupToken(token) && !isDiagnosticText(source, index)) {
      found.push(...markupFindings(source, index, seen));
    }
  }
  return [...found, ...formatMarkup(source)];
}
