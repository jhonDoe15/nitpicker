import { frameAt } from '../max-value-sums/source-file.mjs';

const WRITERS = new Set([
  'append',
  'print',
  'println',
  'printf',
  'write',
  'add',
  'put',
  'log',
  'warn',
  'info',
  'error',
  'debug',
  'trace',
  'format',
]);
const NOT_TYPES = new Set(['return', 'else', 'new', 'throw', 'case', 'in', 'is', 'as']);

function isDeclaration(tokens, index) {
  const previous = tokens[index - 1];
  if (previous === undefined) {
    return false;
  }
  const typed = previous.kind === 'identifier' && !NOT_TYPES.has(previous.text);
  return typed || previous.text === '>' || previous.text === ']';
}

function declaredBefore(source, frame, { name, at }) {
  const { tokens } = source;
  return tokens
    .slice(frame.body.from, at)
    .some(({ text }, offset) => text === name && isDeclaration(tokens, frame.body.from + offset));
}

export function isField(source, { name, at }) {
  const { tokens } = source;
  if (tokens[at - 1]?.text === '.' && tokens[at - 2]?.text === 'this') {
    return true;
  }
  const frame = frameAt(source, at);
  if (frame === undefined) {
    return false;
  }
  return !(
    frame.params.some((param) => param.name === name) || declaredBefore(source, frame, { name, at })
  );
}

export function initialises(calledNames) {
  return [...calledNames].some((name) => !WRITERS.has(name));
}
