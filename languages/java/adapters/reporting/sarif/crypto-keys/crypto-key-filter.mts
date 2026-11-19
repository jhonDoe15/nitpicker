import { blanked } from './java-scopes.mts';
import { offsetOf } from '../../../review-rules/java-sources.mts';
import { isRuntime } from './key-expression.mts';
import type { JavaFinding, SourceReader } from '../../../typed/java-values.mts';

const RULE = 'HardCodedCryptoKey';
const KEY_SPEC = /new\s+SecretKeySpec\s*\(/u;
const ARRAY_OPENERS = ']=,({';
const ARRAY_FOLLOWERS = ',);.]';
const DEPTH_STEPS = new Map([
  ['(', 1],
  [')', -1],
]);
const DECLARATION = /^(?:[\w<>[\],.?\s]+\s)?[A-Za-z_$][\w$]*\s*=(?!=)([\s\S]*)$/u;

function previousCharacter(clean: string, index: number): string {
  return clean.slice(0, index).trimEnd().at(-1) ?? '';
}

function nextCharacter(clean: string, index: number): string {
  return clean.slice(index + 1).trimStart()[0] ?? '';
}

function isArrayBrace(clean: string, index: number): boolean {
  return clean[index] === '{'
    ? ARRAY_OPENERS.includes(previousCharacter(clean, index))
    : ARRAY_FOLLOWERS.includes(nextCharacter(clean, index));
}

function startsStatement(clean: string, index: number, nested: number): boolean {
  const character = clean[index];
  if (character === ';') {
    return nested === 0;
  }
  return (character === '{' || character === '}') && nested === 0 && !isArrayBrace(clean, index);
}

function nestingAfter(character: string | undefined, nested: number): number {
  if (character === '}') {
    return nested + 1;
  }
  return character === '{' ? Math.max(nested - 1, 0) : nested;
}

function descending(count: number): number[] {
  return Array.from({ length: count }, (_, step) => count - 1 - step);
}

function statementStart(clean: string, offset: number): number {
  let nested = 0;
  for (const index of descending(offset)) {
    const character = clean[index];
    if (startsStatement(clean, index, nested)) {
      return index;
    }
    nested = nestingAfter(character, nested);
  }
  return -1;
}

function statementAt(text: string, offset: number): string | undefined {
  const start = statementStart(blanked(text), offset);
  const end = text.indexOf(';', offset);
  return end === -1 ? undefined : text.slice(start + 1, end);
}

function firstArgument(statement: string): string | undefined {
  const match = KEY_SPEC.exec(statement);
  if (match === null) {
    return undefined;
  }
  let depth = 0;
  const rest = statement.slice(match.index + match[0].length);
  for (const [index, character] of Array.from(rest).entries()) {
    if (depth === 0 && (character === ')' || character === ',')) {
      return rest.slice(0, index);
    }
    depth += DEPTH_STEPS.get(character) ?? 0;
  }
  return rest;
}

function keyExpression(statement: string): string | undefined {
  return firstArgument(statement) ?? DECLARATION.exec(statement)?.[1];
}

function builtFromRuntime(finding: JavaFinding, sourceText: SourceReader): boolean {
  const { location } = finding;
  const text = location === undefined ? undefined : sourceText(finding.path);
  if (text === undefined || location === undefined) {
    return false;
  }
  const offset = offsetOf(
    text,
    { line: location.line ?? 1, column: location.column ?? 1 },
    /\r?\n/u,
  );
  const statement = statementAt(text, offset);
  const expression = statement === undefined ? undefined : keyExpression(statement);
  return expression !== undefined && isRuntime(expression, { source: text, offset });
}

export function withoutRuntimeCryptoKeys(
  findings: readonly JavaFinding[],
  { sourceText }: { sourceText: SourceReader },
): JavaFinding[] {
  return findings.filter(
    (finding) =>
      !(finding.tool === 'pmd' && finding.rule === RULE && builtFromRuntime(finding, sourceText)),
  );
}
