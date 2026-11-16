import { tokenizeJvm } from '../../reuse/source/jvm-tokens.mjs';

const CLOSERS = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);
const NOT_FUNCTIONS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'synchronized',
  'try',
  'return',
  'new',
  'throw',
  'else',
  'do',
  'when',
  'super',
  'this',
  'assert',
  'case',
]);
const CLOSERS_ONLY = new Set([')', ']', '}']);
const ANGLE_STEPS = new Map([
  ['<', 1],
  ['>', -1],
]);
const BEFORE_DECLARED_NAME = new Set(['>', ']', ')', '}', ';', '{']);
const STOPS_SIGNATURE = new Set(['fun', 'val', 'var', 'class', 'object', '}', ';']);
const CONTINUING = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '&&',
  '||',
  '?:',
  '.',
  '?.',
  '(',
  ',',
  '=',
  '->',
  '&',
  '|',
]);

function structureOf(tokens) {
  const partner = new Int32Array(tokens.length).fill(-1);
  const opener = new Int32Array(tokens.length).fill(-1);
  const stack = [];
  for (const [index, { text, kind }] of tokens.entries()) {
    opener[index] = stack.at(-1) ?? -1;
    if (kind === 'operator' && CLOSERS.has(text)) {
      stack.push(index);
    } else if (kind === 'operator' && [')', ']', '}'].includes(text) && stack.length > 0) {
      const open = stack.pop();
      partner[open] = index;
      partner[index] = open;
      opener[index] = stack.at(-1) ?? -1;
    }
  }
  return { partner, opener };
}

export function startsNewLine(tokens, index) {
  return (
    index > 0 &&
    tokens[index].line > tokens[index - 1].line &&
    !CONTINUING.has(tokens[index - 1].text)
  );
}

export function* forward(source, from) {
  const positions = [from];
  for (const index of positions) {
    if (index < source.tokens.length) {
      const group = source.partner[index] > index;
      const end = group ? source.partner[index] + 1 : index + 1;
      yield { index, end, group };
      positions.push(end);
    }
  }
}

export function* backward(source, last) {
  const positions = [last];
  for (const index of positions) {
    if (index >= 0) {
      const group =
        CLOSERS_ONLY.has(source.tokens[index].text) &&
        source.partner[index] >= 0 &&
        source.partner[index] < index;
      const start = group ? source.partner[index] : index;
      yield { index, start, group };
      positions.push(start - 1);
    }
  }
}

export function angleStep(text) {
  return ANGLE_STEPS.get(text) ?? 0;
}

export function between(from, to) {
  return [...Array(Math.max(0, to - from)).keys()].map((offset) => from + offset);
}

export function splitTopLevel(source, { from, to }) {
  const parts = [];
  let start = from;
  let angle = 0;
  for (const { index, end } of forward(source, from)) {
    if (index >= to) {
      break;
    }
    const { text } = source.tokens[index];
    angle += angleStep(text);
    if (text === ',' && angle <= 0 && end === index + 1) {
      parts.push({ from: start, to: index });
      start = index + 1;
    }
  }
  return start < to ? [...parts, { from: start, to }] : parts;
}

function javaParam(tokens, segment) {
  const names = tokens.slice(segment.from, segment.to).filter(({ kind }) => kind === 'identifier');
  return names.length >= 2 ? { name: names.at(-1).text } : undefined;
}

function kotlinParam(source, segment) {
  const { tokens } = source;
  let colon = -1;
  for (const { index } of forward(source, segment.from)) {
    if (index >= segment.to || tokens[index].text === ':') {
      colon = index < segment.to ? index : -1;
      break;
    }
  }
  if (colon <= segment.from || tokens[colon - 1].kind !== 'identifier') {
    return undefined;
  }
  const assign = tokens.findIndex(
    (token, index) => index > colon && index < segment.to && token.text === '=',
  );
  return {
    name: tokens[colon - 1].text,
    ...(assign === -1 ? {} : { defaultValue: { from: assign + 1, to: segment.to } }),
  };
}

function paramsOf(source, { open, kotlin }) {
  const { tokens, partner } = source;
  return splitTopLevel(source, { from: open + 1, to: partner[open] }).flatMap((segment) => {
    const param = kotlin ? kotlinParam(source, segment) : javaParam(tokens, segment);
    return param === undefined ? [] : [param];
  });
}

function javaFrame(tokens, partner, index) {
  const before = tokens[index - 1]?.text;
  const declared =
    index > 0 && (tokens[index - 1].kind === 'identifier' || BEFORE_DECLARED_NAME.has(before));
  if (
    !declared ||
    before === 'new' ||
    tokens[index].kind !== 'identifier' ||
    NOT_FUNCTIONS.has(tokens[index].text)
  ) {
    return undefined;
  }
  const close = partner[index + 1];
  const body = tokens.findIndex((token, at) => at > close && ['{', ';', '='].includes(token.text));
  return tokens[body]?.text === '{' && partner[body] > body
    ? { open: index + 1, body: { from: body + 1, to: partner[body] } }
    : undefined;
}

function expressionEnd(source, from) {
  const { tokens } = source;
  let last = from;
  for (const { index, end, group } of forward(source, from)) {
    if (!group && ((index > from && startsNewLine(tokens, index)) || tokens[index].text === '}')) {
      return index;
    }
    last = end;
  }
  return last;
}

function kotlinBody(source, close) {
  const { tokens, partner } = source;
  for (const { index } of forward(source, close + 1)) {
    const { text } = tokens[index];
    if (text === '{' && partner[index] > index) {
      return { from: index + 1, to: partner[index] };
    }
    if (text === '=') {
      return { from: index + 1, to: expressionEnd(source, index + 1) };
    }
    if (STOPS_SIGNATURE.has(text)) {
      return undefined;
    }
  }
  return undefined;
}

function kotlinFrame(source, index) {
  const { tokens, partner } = source;
  const open = tokens.findIndex((token, at) => at > index && token.text === '(');
  const body = open === -1 || partner[open] < 0 ? undefined : kotlinBody(source, partner[open]);
  return body === undefined || tokens[open - 1].kind !== 'identifier' ? undefined : { open, body };
}

function frameFor(source, index) {
  const { tokens, partner, kotlin } = source;
  if (kotlin) {
    return tokens[index].text === 'fun' ? kotlinFrame(source, index) : undefined;
  }
  return tokens[index + 1]?.text === '(' && partner[index + 1] > 0
    ? javaFrame(tokens, partner, index)
    : undefined;
}

function framesOf(source) {
  const { tokens, kotlin } = source;
  return tokens.keys().flatMap((index) => {
    const frame = frameFor(source, index);
    return frame === undefined
      ? []
      : [
          {
            ...frame,
            name: tokens[frame.open - 1].text,
            params: paramsOf(source, { open: frame.open, kotlin }),
          },
        ];
  });
}

export function parseSource(text, { file, kotlin }) {
  const tokens = tokenizeJvm(text, { kotlin });
  const { partner, opener } = structureOf(tokens);
  const source = { file, kotlin, tokens, partner, opener };
  return { ...source, frames: [...framesOf(source)] };
}

export function frameAt(source, index) {
  return source.frames
    .filter(
      ({ open, body }) =>
        index > open && index < body.to && (index >= body.from || index < source.partner[open]),
    )
    .reduce((best, each) => (best === undefined || each.open > best.open ? each : best), undefined);
}
