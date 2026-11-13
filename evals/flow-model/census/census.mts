import { readFileSync } from 'node:fs';
import path from 'node:path';
import type typescript from 'typescript';
import { ts as selectedTypeScript } from '../../../languages/typescript/typescript-api/typescript-api.mjs';
import { analyzeSource } from '../analyze.mts';
import type { AnalysisResult } from '../model/run-types.mts';

const ts: typeof typescript = selectedTypeScript;

export type CensusEntry = { readonly file: string; readonly text: string; readonly entry: string };

type Counts = {
  readonly classes: Record<string, number>;
  readonly anyReason: Record<string, number>;
  readonly firstReason: Record<string, number>;
  readonly syntax: Record<string, number>;
  errors: number;
};

const CONTRACT_REASONS = new Set([
  'unknown-call',
  'unknown-dispatch',
  'missing-semantics',
  'unknown-guard',
]);
const OUTSIDE_PRODUCTION =
  /\.test\.mjs$|(?:^|\/)(?:fixtures|test-support|__tests__|e2e|[a-z]+-e2e)\//u;
const TOP_SYNTAX = 12;

export function isCensusFile(file: string): boolean {
  return file.endsWith('.mjs') && !OUTSIDE_PRODUCTION.test(file);
}

function isFunctionValue(node: typescript.Node | undefined): boolean {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function statementEntries(statement: typescript.Statement): string[] {
  if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
    return [statement.name.text];
  }
  if (!ts.isVariableStatement(statement)) {
    return [];
  }
  return statement.declarationList.declarations.flatMap((item) =>
    ts.isIdentifier(item.name) && isFunctionValue(item.initializer) ? [item.name.text] : [],
  );
}

export function entriesOf(file: string, text: string): CensusEntry[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  return source.statements.flatMap(statementEntries).map((entry) => ({ file, text, entry }));
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sorted(counts: Record<string, number>, limit = Infinity): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .sort(([left, a], [right, b]) => b - a || left.localeCompare(right))
      .slice(0, limit),
  );
}

function classOf(result: AnalysisResult): string {
  if (result.status === 'complete') {
    return 'complete';
  }
  const kinds = new Set(result.reasons.map(({ reason }) => reason));
  return [...kinds].every((kind) => CONTRACT_REASONS.has(kind)) ? 'contractsOnly' : 'needsSyntax';
}

function tally(counts: Counts, result: AnalysisResult): void {
  increment(counts.classes, classOf(result));
  for (const kind of new Set(result.reasons.map(({ reason }) => reason))) {
    increment(counts.anyReason, kind);
  }
  const [first] = result.reasons;
  if (first !== undefined) {
    increment(counts.firstReason, first.reason);
  }
  const syntax = result.reasons
    .filter((item) => item.reason === 'unsupported-syntax')
    .map((item) => item.detail.split(' ').at(0) ?? '');
  for (const form of new Set(syntax)) {
    increment(counts.syntax, form);
  }
}

export function censusOf(entries: readonly CensusEntry[]) {
  const counts: Counts = { classes: {}, anyReason: {}, firstReason: {}, syntax: {}, errors: 0 };
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

export function repositoryCensus(root: string, files: readonly string[]) {
  const included = files.filter(isCensusFile);
  const entries = included.flatMap((file) =>
    entriesOf(file, readFileSync(path.join(root, file), 'utf8')),
  );
  return { files: included.length, ...censusOf(entries) };
}
