import { blanked } from './java-scopes.mjs';
import { isRuntime } from './key-expression.mjs';

const RULE = 'HardCodedCryptoKey';
const KEY_SPEC = /new\s+SecretKeySpec\s*\(/u;
const ARRAY_OPENERS = ']=,({';
const ARRAY_FOLLOWERS = ',);.]';
const DEPTH_STEPS = new Map([
  ['(', 1],
  [')', -1],
]);
const DECLARATION = /^(?:[\w<>[\],.?\s]+\s)?[A-Za-z_$][\w$]*\s*=(?!=)([\s\S]*)$/u;

function offsetOf(text, { line, column = 1 }) {
  const before = text.split(/\r?\n/u).slice(0, line - 1);
  return before.reduce((sum, row) => sum + row.length + 1, 0) + column - 1;
}

function previousCharacter(clean, index) {
  return clean.slice(0, index).trimEnd().at(-1) ?? '';
}

function nextCharacter(clean, index) {
  return clean.slice(index + 1).trimStart()[0] ?? '';
}

function isArrayBrace(clean, index) {
  return clean[index] === '{'
    ? ARRAY_OPENERS.includes(previousCharacter(clean, index))
    : ARRAY_FOLLOWERS.includes(nextCharacter(clean, index));
}

function startsStatement(clean, index, nested) {
  const character = clean[index];
  if (character === ';') {
    return nested === 0;
  }
  return (character === '{' || character === '}') && nested === 0 && !isArrayBrace(clean, index);
}

function nestingAfter(character, nested) {
  if (character === '}') {
    return nested + 1;
  }
  return character === '{' ? Math.max(nested - 1, 0) : nested;
}

function descending(count) {
  return Array.from({ length: count }, (_, step) => count - 1 - step);
}

function statementStart(clean, offset) {
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

function statementAt(text, offset) {
  const start = statementStart(blanked(text), offset);
  const end = text.indexOf(';', offset);
  return end === -1 ? undefined : text.slice(start + 1, end);
}

function firstArgument(statement) {
  const match = KEY_SPEC.exec(statement);
  if (match === null) {
    return undefined;
  }
  let depth = 0;
  const rest = statement.slice(match.index + match[0].length);
  for (const [index, character] of [...rest].entries()) {
    if (depth === 0 && (character === ')' || character === ',')) {
      return rest.slice(0, index);
    }
    depth += DEPTH_STEPS.get(character) ?? 0;
  }
  return rest;
}

function keyExpression(statement) {
  return firstArgument(statement) ?? DECLARATION.exec(statement)?.[1];
}

function builtFromRuntime(finding, sourceText) {
  const text = finding.location === undefined ? undefined : sourceText(finding.path);
  if (text === undefined) {
    return false;
  }
  const offset = offsetOf(text, finding.location);
  const statement = statementAt(text, offset);
  const expression = statement === undefined ? undefined : keyExpression(statement);
  return expression !== undefined && isRuntime(expression, { source: text, offset });
}

export function withoutRuntimeCryptoKeys(findings, { sourceText }) {
  return findings.filter(
    (finding) =>
      !(finding.tool === 'pmd' && finding.rule === RULE && builtFromRuntime(finding, sourceText)),
  );
}
