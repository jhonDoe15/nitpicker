import { closingIndex, isOperator, kotlinTokens } from './kotlin-tokens.mts';
import { expression, isCallOpen, MAX_DEPTH, parseArguments } from './unit-expressions.mts';
import { reportAssigned, TIME_UNIT_RULE } from './unit-reports.mts';
import type { Scanned } from '../../typed/scan-shapes.mts';
import type { Reported } from '../../typed/rule-shapes.mts';
import type { Levels, Parser, UnitBase, UnitFile, UnitToken, UnitValue } from './unit-shapes.mts';

type Level = { depth: number; declared: Map<string, UnitValue>; opens: number[] };
type Target = { name: string; named: boolean };

const STARTS = new Set([
  '(',
  ',',
  '{',
  ';',
  '->',
  '&&',
  '||',
  '!',
  '[',
  '?:',
  '=',
  '+=',
  '-=',
  '..',
  '}',
]);
const START_WORDS = new Set(['return', 'else', 'in', 'if', 'while']);
const ASSIGNING = new Set(['=', '+=', '-=']);
const DECLARING = new Set(['val', 'var']);
const TYPE_PARTS = new Set(['.', '<', '>', '?', ',', '*']);
const DECLARATION_ENDS = new Set(['\n', ';', '{', '}', '(']);
const DURATION_IMPORT = /\bimport\s+kotlin\.time\.Duration\.Companion\.(\w+|\*)/gu;
const GROUPING = new Set(['(']);
const FUNCTION_NAME_REACH = 8;
const TYPE_REACH = 16;

function uniquely<Value>(entries: [string, Value][]): Map<string, Value> {
  const counts = Map.groupBy(entries, ([name]) => name);
  return new Map(
    [...counts].flatMap(([name, found]): [string, Value][] => {
      const [only] = found;
      return found.length === 1 && only !== undefined ? [[name, only[1]]] : [];
    }),
  );
}

function initializerOf(tokens: UnitToken[], declaration: number): number | undefined {
  const rest = tokens.slice(declaration + 2, declaration + TYPE_REACH);
  const end = rest.findIndex(({ text }) => text === '=' || DECLARATION_ENDS.has(text));
  return rest[end]?.text === '=' ? declaration + 2 + end + 1 : undefined;
}

function isDeclaration(tokens: UnitToken[], index: number): boolean {
  const token = tokens[index];
  return token?.kind === 'id' && DECLARING.has(token.text) && tokens[index + 1]?.kind === 'id';
}

function declaredValues(tokens: UnitToken[]): Map<string, number> {
  const declarations = [...tokens.keys()].filter((index) => isDeclaration(tokens, index));
  const values = uniquely(
    declarations.map((index): [string, number | undefined] => [
      tokens[index + 1]?.text ?? '',
      tokens[index]?.text === 'val' ? initializerOf(tokens, index) : undefined,
    ]),
  );
  return new Map(
    [...values].flatMap(([name, start]): [string, number][] =>
      start === undefined ? [] : [[name, start]],
    ),
  );
}

function parameterNames(tokens: UnitToken[], open: number): string[] {
  const close = closingIndex(tokens, open);
  return tokens
    .slice(open + 1, close)
    .filter(
      (token, index, inside) =>
        token.kind === 'id' && inside[index + 1]?.text === ':' && token.inside === '(',
    )
    .map(({ text }) => text);
}

function functionOpen(tokens: UnitToken[], index: number): number | undefined {
  const offset = tokens
    .slice(index + 1, index + FUNCTION_NAME_REACH)
    .findIndex(({ text }) => text === '(');
  return offset === -1 ? undefined : index + 1 + offset;
}

function declaredFunctions(tokens: UnitToken[]): Map<string, string[]> {
  const opens = [...tokens.keys()]
    .filter((index) => tokens[index]?.kind === 'id' && tokens[index].text === 'fun')
    .map((index) => functionOpen(tokens, index))
    .filter((open): open is number => open !== undefined && tokens[open - 1]?.kind === 'id');
  return uniquely(
    opens.map((open): [string, string[]] => [
      tokens[open - 1]?.text ?? '',
      parameterNames(tokens, open),
    ]),
  );
}

function annotatedName(tokens: UnitToken[], index: number): string | undefined {
  const before = tokens.slice(Math.max(0, index - TYPE_REACH), index).toReversed();
  const stop = before.findIndex((token) => token.kind !== 'id' && !TYPE_PARTS.has(token.text));
  const name = before[stop + 1];
  return before[stop]?.text === ':' && name?.kind === 'id' ? name.text : undefined;
}

function assignmentTarget(tokens: UnitToken[], index: number): Target | undefined {
  const before = tokens[index - 1];
  if (before?.kind !== 'id') {
    return undefined;
  }
  const annotated = annotatedName(tokens, index);
  if (annotated !== undefined) {
    return { name: annotated, named: false };
  }
  const opener = tokens[index - 2];
  const named = before.inside === '(' && (opener?.text === '(' || opener?.text === ',');
  return { name: before.text, named };
}

function startsExpression(tokens: UnitToken[], index: number): boolean {
  const previous = tokens[index - 1];
  return (
    tokens[index]?.kind !== 'nl' &&
    (index === 0 ||
      previous?.kind === 'nl' ||
      (previous?.kind === 'op' && STARTS.has(previous.text)) ||
      (previous?.kind === 'id' && START_WORDS.has(previous.text)))
  );
}

function levelValues(file: UnitBase, { depth, declared, opens }: Level): Levels {
  const target: UnitBase = depth === 0 ? file : { ...file, reports: new Map() };
  const regions: Parser['regions'] = new Map();
  const { tokens } = file;
  for (const open of opens) {
    const parser: Parser = { file: target, tokens, position: open, depth, regions, declared };
    if (isCallOpen(tokens, open)) {
      regions.set(open, parseArguments(parser));
    } else {
      parser.position += 1;
      regions.set(open, expression(parser));
    }
  }
  const values = [...file.values].map(([name, position]): [string, UnitValue] => [
    name,
    expression({ file: target, tokens, position, depth, regions, declared }),
  ]);
  return { regions, declared, values: new Map(values) };
}

function unitLevels(file: UnitBase): Levels {
  const { tokens } = file;
  const opens = [...tokens.keys()]
    .filter((index) => isOperator(tokens[index], GROUPING))
    .toSorted((left, right) => (tokens[right]?.nesting ?? 0) - (tokens[left]?.nesting ?? 0));
  const depths = [...Array.from({ length: MAX_DEPTH + 1 }).keys()].toReversed();
  const seed: Levels = { regions: new Map(), declared: new Map(), values: new Map() };
  return depths.reduce(
    (deeper: Levels, depth: number) => levelValues(file, { depth, declared: deeper.values, opens }),
    seed,
  );
}

function parseExpression(file: UnitFile, position: number): UnitValue {
  const { regions, declared } = file.levels;
  return expression({ file, tokens: file.tokens, position, depth: 0, regions, declared });
}

function checkAssignment(file: UnitFile, index: number): void {
  const target = assignmentTarget(file.tokens, index);
  if (target !== undefined && !target.named) {
    const value = parseExpression(file, index + 1);
    reportAssigned(file, { index: index + 1, target: target.name, value });
  }
}

function unitFile(scanned: Scanned): UnitFile {
  const tokens = kotlinTokens(scanned.code);
  const file: UnitBase = {
    code: scanned.code,
    tokens,
    values: declaredValues(tokens),
    functions: declaredFunctions(tokens),
    imports: new Set([...scanned.code.matchAll(DURATION_IMPORT)].map((match) => match[1])),
    reports: new Map(),
  };
  return { ...file, levels: unitLevels(file) };
}

export function timeUnitMismatches(scanned: Scanned): Reported[] {
  const file = unitFile(scanned);
  for (const [index, token] of file.tokens.entries()) {
    if (startsExpression(file.tokens, index)) {
      parseExpression(file, index);
    }
    if (token.kind === 'op' && ASSIGNING.has(token.text)) {
      checkAssignment(file, index);
    }
  }
  return [...file.reports.values()];
}

export const kotlinSourceRules = {
  messages: {
    [TIME_UNIT_RULE]:
      'Time values in different units meet here without a conversion (seconds with milliseconds, for example), or an epoch time is cut to a 32-bit `Int`. Convert once where the value enters, name it with its unit, and keep epoch times in a `Long` or an `Instant`.',
  },
  main: [timeUnitMismatches],
};
