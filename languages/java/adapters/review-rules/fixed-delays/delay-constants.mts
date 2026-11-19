import { startsNewLine } from '../max-value-sums/source-file.mts';
import type { SourceFile, Span } from '../max-value-sums/sum-types.mts';

const DURATION_UNITS = new Map([
  ['milliseconds', 1],
  ['seconds', 1000],
  ['minutes', 60_000],
  ['hours', 3_600_000],
]);
const DECLARATION_BREAKS = new Set([';', '{', '}']);
const OPERAND = /^(\d[\d_]*(?:\.\d[\d_]*)?)[lLfFdDuU]*(?:\.(milliseconds|seconds|minutes|hours))?$/u;
const NAMED_UNIT = /^(\w+)\.(milliseconds|seconds|minutes|hours)$/u;
const TYPE_WINDOW = 4;

export type Constants = ReadonlyMap<string, number>;

function namedValue(text: string, constants: Constants): number | undefined {
  const [, name = '', unit] = NAMED_UNIT.exec(text) ?? [];
  if (unit !== undefined) {
    const value = constants.get(name);
    return value === undefined ? undefined : value * (DURATION_UNITS.get(unit) ?? 1);
  }
  return constants.get(text.slice(text.lastIndexOf('.') + 1));
}

function operandValue(text: string, constants: Constants): number | undefined {
  const [, digits, unit] = OPERAND.exec(text) ?? [];
  if (digits === undefined) {
    return namedValue(text, constants);
  }
  return Number(digits.replaceAll('_', '')) * (DURATION_UNITS.get(unit ?? '') ?? 1);
}

function productValue(term: string, constants: Constants): number | undefined {
  return term
    .split('*')
    .map((operand) => operandValue(operand, constants))
    .reduce<number | undefined>(
      (total, value) => (total === undefined || value === undefined ? undefined : total * value),
      1,
    );
}

export function evaluate(
  source: SourceFile,
  constants: Constants,
  { from, to }: Span,
): number | undefined {
  const text = source.tokens
    .slice(from, to)
    .map((token) => token.text)
    .join('');
  return text
    .split('+')
    .map((term) => productValue(term, constants))
    .reduce<number | undefined>(
      (total, value) => (total === undefined || value === undefined ? undefined : total + value),
      0,
    );
}

function declaredWords(source: SourceFile, name: number): string[] {
  const line = source.tokens[name]?.line ?? 0;
  const before = source.tokens
    .slice(0, name)
    .reverse()
    .map(({ text, line: at }) => ({ text, same: at >= line }));
  const stop = before.findIndex(({ text, same }) => DECLARATION_BREAKS.has(text) || !same);
  return before.slice(0, stop === -1 ? undefined : stop).map(({ text }) => text);
}

function isConstantDeclaration(source: SourceFile, name: number): boolean {
  const words = declaredWords(source, name);
  if (source.kotlin) {
    return words.includes('const') || (words.includes('val') && (source.opener[name] ?? -1) === -1);
  }
  return words.includes('static') && words.includes('final');
}

function assignmentOf(source: SourceFile, name: number): number {
  const next = source.tokens[name + 1]?.text;
  if (next === '=') {
    return name + 1;
  }
  const typed = source.kotlin && next === ':' ? source.tokens.slice(name + 2, name + TYPE_WINDOW + 2) : [];
  const offset = typed.findIndex(({ text }) => text === '=');
  return offset === -1 ? -1 : name + 2 + offset;
}

function valueEnd(source: SourceFile, assign: number): number {
  const end = source.tokens.findIndex(
    (token, at) => at > assign + 1 && (token.text === ';' || token.text === '}' || startsNewLine(source.tokens, at)),
  );
  return end === -1 ? source.tokens.length : end;
}

export function delayConstants(source: SourceFile): Constants {
  const constants = new Map<string, number>();
  for (const [name, token] of source.tokens.entries()) {
    const assign = token.kind === 'identifier' ? assignmentOf(source, name) : -1;
    if (assign !== -1 && isConstantDeclaration(source, name)) {
      const value = evaluate(source, constants, { from: assign + 1, to: valueEnd(source, assign) });
      if (value !== undefined) {
        constants.set(token.text, value);
      }
    }
  }
  return constants;
}
