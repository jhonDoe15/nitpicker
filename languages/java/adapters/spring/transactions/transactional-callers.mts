import path from 'node:path';
import { escapeRegExp } from '../typed/shared-views.mts';
import {
  offsetOf,
  pathInside,
  readJavaSource,
  sourceFilesUnder,
} from '../../review-rules/java-sources.mts';
import { TRANSACTIONAL, prefixOf } from './inherited-transactions.mts';
import { indexCalls } from './call-sites.mts';
import { bodyOf, delimiterStacks, nameAfter } from './bodies/method-bodies.mts';
import type { JavaFinding } from '../../typed/java-values.mts';
import type {
  BodyKind,
  CallMatcher,
  CallSource,
  CallState,
  DelimiterEntry,
  StepOutcome,
  SiteInput,
  TransactionOptions,
  TransactionRun,
} from './transaction-types.mts';

const BLOCK_BODY = 'block';
const LAMBDA_BODY = 'lambda';
const RULE = 'SpringMultiWriteWithoutTransaction';
const TEST_SOURCES = /(?:^|[/\\])src[/\\]test[/\\]/u;
const TRANSACTIONAL_ARGUMENTS = /@(?:[\w.]*\.)?Transactional\b(\s*\((?:[^()]|\([^()]*\))*\))?/u;
const SPRING_OUTSIDE = /\bpropagation\s*=\s*[\w.]*\b(?:NOT_SUPPORTED|NEVER|SUPPORTS)\b/u;
const JAKARTA_OUTSIDE = /\b(?:NOT_SUPPORTED|NEVER|SUPPORTS)\b/u;
const JAKARTA = /\b(?:jakarta|javax)\.transaction\.Transactional\b/u;
const TRANSACTION_TYPES = 'TransactionTemplate|TransactionOperations|TransactionalOperator';
const DECLARED_TEMPLATES = new RegExp(
  String.raw`\b(?:${TRANSACTION_TYPES})(?:\s*<[\w<>?, ]*>)?\s+(\w+)|(\w+)\s*:\s*(?:${TRANSACTION_TYPES})\b`,
  'gu',
);
const CONTROL = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'synchronized',
  'try',
  'with',
  'when',
]);
const CONTROL_HEADER = /^(?:else|try|finally|do|static|when|(?:case|default)\b.*)?$/u;
const TYPE_KEYWORD = /\b(?:class|interface|object|enum|record)\s+\w+/u;
const WRAPPER_LOOKBEHIND = 80;

function beforeIndex(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index - length), index);
}

function kindOf(header: string, kotlin: boolean): BodyKind {
  const trimmed = header.trim();
  if (
    /\bnew\s/u.test(trimmed) ||
    (trimmed.includes('->') && !/^(?:case|default)\b/u.test(trimmed))
  ) {
    return LAMBDA_BODY;
  }
  if (TYPE_KEYWORD.test(trimmed) && !/\bfun\b/u.test(trimmed)) {
    return 'class';
  }
  const call = /([\w$]+)\s*\([^]*\)\s*(?:throws[^]*)?$/u.exec(trimmed);
  if (/\bfun\b/u.test(trimmed) || (call !== null && !CONTROL.has(call[1] ?? '') && !kotlin)) {
    return 'method';
  }
  if (CONTROL_HEADER.test(trimmed) || (call !== null && CONTROL.has(call[1] ?? ''))) {
    return BLOCK_BODY;
  }
  return kotlin ? LAMBDA_BODY : BLOCK_BODY;
}

function runsIn(header: string, text: string): StepOutcome {
  if (!TRANSACTIONAL.test(header)) {
    return undefined;
  }
  const annotation = TRANSACTIONAL_ARGUMENTS.exec(header);
  if (annotation === null) {
    return undefined;
  }
  const jakarta = JAKARTA.test(annotation[0]) || JAKARTA.test(text);
  return !(jakarta ? JAKARTA_OUTSIDE : SPRING_OUTSIDE).test(annotation[1] ?? '');
}

function templateCall(text: string): CallMatcher {
  const names = [...text.matchAll(DECLARED_TEMPLATES)].map((match) => match[1] ?? match[2] ?? '');
  if (names.length === 0) {
    return { test: () => false };
  }
  const receivers = names.map((name) => escapeRegExp(name)).join('|');
  return new RegExp(
    String.raw`\b(?:${receivers})\s*\.\s*(?:execute|executeWithoutResult|transactional)\s*$`,
    'u',
  );
}

function parenStep(state: CallState, entry: DelimiterEntry): StepOutcome {
  if (state.call.test(beforeIndex(state.text, entry.index, WRAPPER_LOOKBEHIND))) {
    return !state.crossed;
  }
  state.crossed ||= state.text.slice(entry.index, state.offset).includes('->');
  return undefined;
}

function isCallback(
  state: CallState,
  header: string,
  wrapped: DelimiterEntry | undefined,
): boolean {
  if (state.call.test(header.trimEnd())) {
    return true;
  }
  const wrapper = beforeIndex(state.text, wrapped?.index ?? 0, WRAPPER_LOOKBEHIND);
  return wrapped !== undefined && state.call.test(wrapper);
}

function classStep(state: CallState, header: string): boolean {
  if (state.method === undefined || state.crossed) {
    return false;
  }
  return runsIn(state.method, state.text) ?? runsIn(header, state.text) ?? false;
}

function braceStep(
  state: CallState,
  entry: DelimiterEntry,
  wrapped: DelimiterEntry | undefined,
): StepOutcome {
  const header = prefixOf(state.text, entry.index);
  const kind = kindOf(header, state.kotlin);
  if (kind === 'class') {
    return classStep(state, header);
  }
  if (kind === 'method' && state.method === undefined) {
    state.method = header;
  }
  if (kind !== LAMBDA_BODY && kind !== BLOCK_BODY) {
    return undefined;
  }
  if (kind === LAMBDA_BODY && isCallback(state, header, wrapped)) {
    return !state.crossed;
  }
  state.crossed ||= kind === LAMBDA_BODY;
  return undefined;
}

function siteTransactional({ text, stack, offset, reference, call, kotlin }: SiteInput): boolean {
  const state: CallState = { text, offset, call, kotlin, crossed: reference, method: undefined };
  const outward = stack.toReversed();
  for (const [position, entry] of outward.entries()) {
    const next = outward[position + 1];
    const wrapped = next?.character === '(' ? next : undefined;
    const decided =
      entry.character === '(' ? parenStep(state, entry) : braceStep(state, entry, wrapped);
    if (decided !== undefined) {
      return decided;
    }
  }
  return false;
}

function sourcesOf(projectRoot: string, roots: readonly string[]): CallSource[] {
  return [...new Set(roots)]
    .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), ['.java', '.kt']))
    .filter((file) => !TEST_SOURCES.test(file))
    .map((file) => ({ file: path.resolve(file), text: readJavaSource(file) ?? '' }));
}

function createRun({ projectRoot, roots }: TransactionOptions): TransactionRun {
  const sources = sourcesOf(projectRoot, roots);
  const texts = new Map(sources.map(({ file, text }) => [file, text]));
  const calls = indexCalls(sources);
  const stacks = new Map<string, Map<number, DelimiterEntry[]>>();
  const templates = new Map<string, CallMatcher>();
  function textOf(file: string): string {
    const known = texts.get(file);
    if (known !== undefined) {
      return known;
    }
    const text = readJavaSource(file) ?? '';
    texts.set(file, text);
    return text;
  }
  function stackAt(file: string, offset: number): readonly DelimiterEntry[] {
    let known = stacks.get(file);
    if (known === undefined) {
      const sites = [...calls.values()].flat().filter((site) => site.file === file);
      known = delimiterStacks(
        textOf(file),
        sites.map((site) => site.offset),
      );
      stacks.set(file, known);
    }
    return known.get(offset) ?? [];
  }
  function templateOf(file: string): CallMatcher {
    let known = templates.get(file);
    if (known === undefined) {
      known = templateCall(textOf(file));
      templates.set(file, known);
    }
    return known;
  }
  return { calls, textOf, stackAt, templateOf };
}

function runsInTransactions(
  finding: JavaFinding,
  run: TransactionRun,
  projectRoot: string,
): boolean {
  const file = path.resolve(projectRoot, finding.path);
  const text = run.textOf(file);
  const method = nameAfter(text, offsetOf(text, { line: finding.location?.line ?? 1 }));
  if (method === undefined) {
    return false;
  }
  const body = bodyOf(text, method.open);
  const sites = (run.calls.get(method.name) ?? []).filter(
    (site) => site.file !== file || site.offset < body.begin || site.offset > body.end,
  );
  return (
    sites.length > 0 &&
    sites.every((site) =>
      siteTransactional({
        text: run.textOf(site.file),
        stack: run.stackAt(site.file, site.offset),
        offset: site.offset,
        reference: site.reference,
        call: run.templateOf(site.file),
        kotlin: site.file.endsWith('.kt'),
      }),
    )
  );
}

export function withoutTransactionalCallers<T extends JavaFinding>(
  findings: T[],
  { projectRoot, roots }: TransactionOptions,
): T[] {
  const candidates = findings.filter(({ tool, rule }) => tool === 'pmd' && rule === RULE);
  if (candidates.length === 0) {
    return findings;
  }
  const run = createRun({ projectRoot, roots });
  return findings.filter(
    (finding) => !(candidates.includes(finding) && runsInTransactions(finding, run, projectRoot)),
  );
}
