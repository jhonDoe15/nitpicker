import { createHash } from 'node:crypto';
import { quickSummary } from './summary.mjs';

const QUICK_SKIPPED_ANALYZERS = ['coverage', 'crap', 'mutation', 'test-console'];

const JVM_SKIPPED_TOOLS = ['tests', 'jacoco', 'crap', 'pit', 'test-runtime'];

const QUICK_SKIPPED_TOOLS = new Map([
  ['python', ['tests', 'coverage', 'crap', 'test-runtime']],
  ['java', JVM_SKIPPED_TOOLS],
  ['kotlin', JVM_SKIPPED_TOOLS],
]);

const QUICK_MODE_ARGUMENTS = ['--mode', 'quick'];
const QUICK_ENVIRONMENT = { NITPICKER_QUICK: '1' };

function quickHash(configurationHash) {
  return createHash('sha256').update(`${configurationHash}\0quick`).digest('hex');
}

function withQuickMode(analyzer, extendInvocation) {
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

function quickAnalyzer(analyzer) {
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

function isSkipped(analyzer) {
  return analyzer.custom !== true && QUICK_SKIPPED_ANALYZERS.includes(analyzer.name);
}

function skippedChecks(analyzers) {
  return [
    ...analyzers.filter(isSkipped).map(({ name }) => name),
    ...analyzers
      .filter((analyzer) => analyzer.custom !== true)
      .flatMap(({ name }) => QUICK_SKIPPED_TOOLS.get(name) ?? []),
  ];
}

function withDependencies(analyzers, names) {
  const byName = new Map(analyzers.map((analyzer) => [analyzer.name, analyzer]));
  const selected = new Set();
  function add(name) {
    if (selected.has(name) || !byName.has(name)) {
      return;
    }
    selected.add(name);
    for (const dependency of byName.get(name).dependencies ?? []) {
      add(dependency);
    }
  }
  for (const name of names) {
    add(name);
  }
  return analyzers.filter(({ name }) => selected.has(name));
}

function selectedAnalyzers(analyzers, names) {
  return names.length === 0 ? analyzers : withDependencies(analyzers, names);
}

function rejectSkippedSelection(analyzerNames, skipped) {
  const rejected = analyzerNames.filter((name) => skipped.includes(name));
  if (rejected.length > 0) {
    throw new Error(
      `--analyzer ${rejected.join(', ')} is skipped by --quick. Run it without --quick.`,
    );
  }
}

export function applyRunProfile(analyzers, options) {
  if (options.quick !== true) {
    return { analyzers, quick: undefined };
  }
  const analyzerNames = options.analyzerNames ?? [];
  rejectSkippedSelection(analyzerNames, skippedChecks(analyzers));
  const skipped = skippedChecks(selectedAnalyzers(analyzers, analyzerNames));
  return {
    analyzers: analyzers.filter((analyzer) => !isSkipped(analyzer)).map(quickAnalyzer),
    quick: quickSummary([...new Set(skipped)]),
  };
}
