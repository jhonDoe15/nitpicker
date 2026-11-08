import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ts } from '../../../languages/typescript/typescript-api/typescript-api.mjs';
import { analyzeSource } from '../analyze.mjs';

const CONTRACT_REASONS = new Set([
  'unknown-call',
  'unknown-dispatch',
  'missing-semantics',
  'unknown-guard',
]);
const OUTSIDE_PRODUCTION = /\.test\.mjs$|(?:^|\/)(?:fixtures|test-support|e2e)\//u;
const TOP_SYNTAX = 12;

export function isCensusFile(file) {
  return file.endsWith('.mjs') && !OUTSIDE_PRODUCTION.test(file);
}

function isFunctionValue(node) {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function statementEntries(statement) {
  if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
    return [statement.name.text];
  }
  if (!ts.isVariableStatement(statement)) {
    return [];
  }
  return statement.declarationList.declarations
    .filter((item) => ts.isIdentifier(item.name) && isFunctionValue(item.initializer))
    .map((item) => item.name.text);
}

export function entriesOf(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  return source.statements.flatMap(statementEntries).map((entry) => ({ file, text, entry }));
}

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sorted(counts, limit = Infinity) {
  return Object.fromEntries(
    Object.entries(counts)
      .sort(([left, a], [right, b]) => b - a || left.localeCompare(right))
      .slice(0, limit),
  );
}

function classOf(result) {
  if (result.status === 'complete') {
    return 'complete';
  }
  const kinds = new Set(result.reasons.map(({ reason }) => reason));
  return [...kinds].every((kind) => CONTRACT_REASONS.has(kind)) ? 'contractsOnly' : 'needsSyntax';
}

function tally(counts, result) {
  increment(counts.classes, classOf(result));
  for (const kind of new Set(result.reasons.map(({ reason }) => reason))) {
    increment(counts.anyReason, kind);
  }
  if (result.reasons.length > 0) {
    increment(counts.firstReason, result.reasons[0].reason);
  }
  const syntax = result.reasons
    .filter((item) => item.reason === 'unsupported-syntax')
    .map((item) => String(item.detail).split(' ')[0]);
  for (const form of new Set(syntax)) {
    increment(counts.syntax, form);
  }
}

export function censusOf(entries) {
  const counts = { classes: {}, anyReason: {}, firstReason: {}, syntax: {}, errors: 0 };
  for (const entry of entries) {
    try {
      tally(counts, analyzeSource({ ...entry, contracts: {} }).result);
    } catch {
      counts.errors += 1;
    }
  }
  return {
    entries: entries.length,
    errors: counts.errors,
    classes: sorted(counts.classes),
    anyReason: sorted(counts.anyReason),
    firstReason: sorted(counts.firstReason),
    unsupportedSyntax: sorted(counts.syntax, TOP_SYNTAX),
  };
}

export function repositoryCensus(root, files) {
  const included = files.filter(isCensusFile);
  const entries = included.flatMap((file) =>
    entriesOf(file, readFileSync(path.join(root, file), 'utf8')),
  );
  return { files: included.length, ...censusOf(entries) };
}
