import { frameAt } from '../max-value-sums/source-file.mts';
import type { Frame, SourceFile } from '../max-value-sums/sum-types.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';

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

function isDeclaration(tokens: readonly Token[], index: number): boolean {
  const previous = tokens[index - 1];
  if (previous === undefined) {
    return false;
  }
  const typed = previous.kind === 'identifier' && !NOT_TYPES.has(previous.text);
  return typed || previous.text === '>' || previous.text === ']';
}

function declaredBefore(
  source: SourceFile,
  frame: Frame,
  { name, at }: { name: string; at: number },
): boolean {
  const { tokens } = source;
  return tokens
    .slice(frame.body.from, at)
    .some(({ text }, offset) => text === name && isDeclaration(tokens, frame.body.from + offset));
}

export function isField(source: SourceFile, { name, at }: { name: string; at: number }): boolean {
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

export function initialises(calledNames: ReadonlySet<string>): boolean {
  return [...calledNames].some((name) => !WRITERS.has(name));
}
