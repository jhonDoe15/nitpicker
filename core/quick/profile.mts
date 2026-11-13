import { createHash } from 'node:crypto';
import { quickSummary } from './summary.mjs';
import { textOf } from '../../shared/values/readers.mts';
import type { ProfiledAnalyzer } from '../../shared/values/analyzers.mts';

type Invocation = ReturnType<ProfiledAnalyzer['createInvocation']>;

type Profile = {
  readonly quick?: unknown;
  readonly analyzerNames?: readonly string[];
};

const summaryOf: (skipped: readonly string[]) => unknown = quickSummary;

const QUICK_SKIPPED_ANALYZERS = ['coverage', 'crap', 'mutation', 'test-console'];

const JVM_SKIPPED_TOOLS = ['tests', 'jacoco', 'crap', 'pit', 'test-runtime'];

const QUICK_SKIPPED_TOOLS: ReadonlyMap<string, readonly string[]> = new Map([
  ['python', ['tests', 'coverage', 'crap', 'test-runtime']],
  ['java', JVM_SKIPPED_TOOLS],
  ['kotlin', JVM_SKIPPED_TOOLS],
]);

const QUICK_MODE_ARGUMENTS = ['--mode', 'quick'];
const QUICK_ENVIRONMENT = { NITPICKER_QUICK: '1' };

function quickHash(configurationHash: unknown): string {
  return createHash('sha256')
    .update(`${textOf(configurationHash)}\0quick`)
    .digest('hex');
}

function withQuickMode(
  analyzer: ProfiledAnalyzer,
  extendInvocation: (invocation: Invocation) => Invocation,
): ProfiledAnalyzer {
  const { resolveConfigurationHash } = analyzer;
  return {
    ...analyzer,
    quick: true,
    configurationHash: quickHash(analyzer.configurationHash),
    ...(resolveConfigurationHash === undefined
      ? {}
      : { resolveConfigurationHash: (root) => quickHash(resolveConfigurationHash(root)) }),
    createInvocation: (context) => extendInvocation(analyzer.createInvocation(context)),
  };
}

function quickAnalyzer(analyzer: ProfiledAnalyzer): ProfiledAnalyzer {
  if (analyzer.custom === true) {
    return withQuickMode(analyzer, (invocation) => ({
      ...invocation,
      env: { ...invocation.env, ...QUICK_ENVIRONMENT },
    }));
  }
  if (QUICK_SKIPPED_TOOLS.has(analyzer.name)) {
    return withQuickMode(analyzer, (invocation) => ({
      ...invocation,
      args: [...invocation.args, ...QUICK_MODE_ARGUMENTS],
    }));
  }
  return analyzer;
}

function isSkipped(analyzer: ProfiledAnalyzer): boolean {
  return analyzer.custom !== true && QUICK_SKIPPED_ANALYZERS.includes(analyzer.name);
}

function skippedChecks(analyzers: readonly ProfiledAnalyzer[]): string[] {
  return [
    ...analyzers.filter(isSkipped).map(({ name }) => name),
    ...analyzers
      .filter((analyzer) => analyzer.custom !== true)
      .flatMap(({ name }) => QUICK_SKIPPED_TOOLS.get(name) ?? []),
  ];
}

function withDependencies(
  analyzers: readonly ProfiledAnalyzer[],
  names: readonly string[],
): ProfiledAnalyzer[] {
  const byName = new Map(analyzers.map((analyzer) => [analyzer.name, analyzer] as const));
  const pending = names.filter((name) => byName.has(name));
  const selected = new Set(pending);
  for (const name of pending) {
    const added = (byName.get(name)?.dependencies ?? []).filter(
      (dependency) => byName.has(dependency) && !selected.has(dependency),
    );
    for (const dependency of added) {
      selected.add(dependency);
    }
    pending.push(...added);
  }
  return analyzers.filter(({ name }) => selected.has(name));
}

function selectedAnalyzers(
  analyzers: readonly ProfiledAnalyzer[],
  names: readonly string[],
): readonly ProfiledAnalyzer[] {
  return names.length === 0 ? analyzers : withDependencies(analyzers, names);
}

function rejectSkippedSelection(
  analyzerNames: readonly string[],
  skipped: readonly string[],
): void {
  const rejected = analyzerNames.filter((name) => skipped.includes(name));
  if (rejected.length > 0) {
    throw new Error(
      `--analyzer ${rejected.join(', ')} is skipped by --quick. Run it without --quick.`,
    );
  }
}

export function applyRunProfile(
  analyzers: readonly ProfiledAnalyzer[],
  options: Profile,
): { readonly analyzers: readonly ProfiledAnalyzer[]; readonly quick: unknown } {
  if (options.quick !== true) {
    return { analyzers, quick: undefined };
  }
  const analyzerNames = options.analyzerNames ?? [];
  rejectSkippedSelection(analyzerNames, skippedChecks(analyzers));
  const skipped = skippedChecks(selectedAnalyzers(analyzers, analyzerNames));
  return {
    analyzers: analyzers.filter((analyzer) => !isSkipped(analyzer)).map(quickAnalyzer),
    quick: summaryOf([...new Set(skipped)]),
  };
}
