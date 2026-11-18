import { referenceLinks } from '../../shared/reference/store.mjs';
import { withDependencies, withoutTestRun } from '../quick/profile.mts';
import { type LabelFilter, labelFilter, matchesFilter, selectedLabels } from './taxonomy.mts';
import { fieldOf, listOf, textOf, textsOf } from '../../shared/values/readers.mts';
import type { ProfiledAnalyzer } from '../../shared/values/analyzers.mts';

type RuleLabels = {
  readonly tool: string;
  readonly analyzers: readonly string[];
  readonly labels: readonly string[];
};

export type LabelSelection = {
  readonly analyzers: readonly ProfiledAnalyzer[];
  readonly filter: LabelFilter | undefined;
  readonly skipped: readonly string[];
};

type SelectionRequest = {
  readonly labelNames: readonly string[];
  readonly analyzerNames: readonly string[];
  readonly preset: string;
  readonly entries?: readonly unknown[];
};

const TEST_RUN_TOOLS = ['coverage', 'crap', 'mutation', 'test-runtime', 'test-console'];
const TEST_RUN_ANALYZERS = TEST_RUN_TOOLS;

function referenceEntries(): readonly unknown[] {
  return listOf(fieldOf(referenceLinks().index(), 'entries'));
}

function ruleLabels(entries: readonly unknown[], preset: string): RuleLabels[] {
  return entries.map((entry) => ({
    tool: textOf(fieldOf(entry, 'tool')),
    analyzers: textsOf(fieldOf(fieldOf(entry, 'analyzers'), preset)),
    labels: textsOf(fieldOf(entry, 'labels')),
  }));
}

function analyzerMatches(name: string, rules: readonly RuleLabels[], filter: LabelFilter): boolean {
  const own = rules.filter(({ analyzers }) => analyzers.includes(name));
  return own.length === 0 || own.some(({ labels }) => matchesFilter(labels, filter));
}

function keeps(
  analyzer: ProfiledAnalyzer,
  {
    rules,
    filter,
    testRun,
    named,
  }: {
    readonly rules: readonly RuleLabels[];
    readonly filter: LabelFilter;
    readonly testRun: boolean;
    readonly named: readonly string[];
  },
): boolean {
  if (analyzer.custom === true || named.includes(analyzer.name)) {
    return true;
  }
  if (TEST_RUN_ANALYZERS.includes(analyzer.name)) {
    return testRun;
  }
  return analyzerMatches(analyzer.name, rules, filter);
}

export function selectByLabels(
  analyzers: readonly ProfiledAnalyzer[],
  request: SelectionRequest,
): LabelSelection {
  const filter = labelFilter(request.labelNames);
  if (filter === undefined) {
    return { analyzers, filter, skipped: [] };
  }
  const rules = ruleLabels(request.entries ?? referenceEntries(), request.preset);
  const testRun = rules.some(
    ({ tool, labels }) => TEST_RUN_TOOLS.includes(tool) && matchesFilter(labels, filter),
  );
  const context = { rules, filter, testRun, named: request.analyzerNames };
  const kept = withDependencies(
    analyzers,
    analyzers.filter((analyzer) => keeps(analyzer, context)).map(({ name }) => name),
  );
  const dropped = analyzers.filter((analyzer) => !kept.includes(analyzer)).map(({ name }) => name);
  if (testRun) {
    return { analyzers: kept, filter, skipped: dropped };
  }
  const trimmed = withoutTestRun(kept);
  return { analyzers: trimmed.analyzers, filter, skipped: [...dropped, ...trimmed.skipped] };
}

type LabeledRunRequest = {
  readonly labelNames?: readonly string[] | undefined;
  readonly analyzerNames: readonly string[];
  readonly preset?: string | undefined;
  readonly stderr: { write(text: string): unknown };
  readonly entries?: readonly unknown[];
};

export function labeledRun<P extends { readonly analyzers: readonly ProfiledAnalyzer[] }>(
  profiled: P,
  request: LabeledRunRequest,
): P & { readonly labels: LabelFilter | undefined } {
  const selection = selectByLabels(profiled.analyzers, {
    labelNames: request.labelNames ?? [],
    analyzerNames: request.analyzerNames,
    preset: request.preset ?? 'typescript',
    ...(request.entries === undefined ? {} : { entries: request.entries }),
  });
  if (selection.filter !== undefined && selection.skipped.length > 0) {
    request.stderr.write(
      `nitpicker: --label ${selectedLabels(selection.filter).join(', ')} skips the checks that cannot report it: ${selection.skipped.join(', ')}\n`,
    );
  }
  return { ...profiled, analyzers: selection.analyzers, labels: selection.filter };
}
