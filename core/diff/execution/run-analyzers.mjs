import { withSharedBuildDirectory } from '../../tooling/build-once/build-once.mjs';
import { spawnSyncWithOutputFile } from '../../tooling/output-file.mjs';
import { headPolicyEnvironment } from '../../../languages/typescript/preset/head-policy.mjs';
import { analyzerName } from '../reporting/report-model.mjs';
import { validateAnalyzer, validateInvocation } from './validation/analyzers.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { namedReports, namedToolErrors } from '../snapshot-root/snapshot-root.mjs';
import { fileURLToPath } from 'node:url';
import { describeError } from '../../../shared/messages/error-chain.mjs';

const MAX_ANALYZER_OUTPUT_BYTES = 50 * 1024 * 1024;

const SCHEDULER_OUTPUT_OVERHEAD_BYTES = 1024 * 1024;

const DEFAULT_ANALYZER_TIMEOUT_MS = 5 * 60 * 1000;

const schedulerPath = fileURLToPath(new URL('./analyzer-scheduler.mjs', import.meta.url));

export function selectAnalyzers(analyzers, analyzerNames) {
  if (analyzerNames.length === 0) {
    return analyzers;
  }

  const analyzersByName = new Map(analyzers.map((analyzer) => [analyzer.name, analyzer]));
  const unknownNames = analyzerNames.filter((name) => !analyzersByName.has(name));
  if (unknownNames.length > 0) {
    const knownNames = analyzers
      .map((analyzer) => analyzer.name)
      .sort()
      .join(', ');
    throw new Error(
      `Unknown --analyzer: ${unknownNames.join(', ')}. Known analyzers: ${knownNames}`,
    );
  }

  const selectedNames = new Set(analyzerNames);
  const pendingNames = [...analyzerNames];
  for (const pendingName of pendingNames) {
    includeDependencies(analyzersByName.get(pendingName), {
      analyzersByName,
      selectedNames,
      pendingNames,
    });
  }

  return analyzers.filter((analyzer) => selectedNames.has(analyzer.name));
}

export function resolveAnalyzerMetadata(analyzer, { liveProjectRoot, policyRoot }) {
  if (typeof analyzer.resolveVersion === 'function') {
    analyzer.version = analyzer.resolveVersion(liveProjectRoot);
  }
  if (typeof analyzer.resolveConfigurationHash === 'function') {
    analyzer.configurationHash = analyzer.resolveConfigurationHash(policyRoot);
  }
}

export function runAnalyzers({
  analyzers,
  projectRoot,
  policyRoot,
  toolRoot,
  snapshot,
  baselineRoot,
  baselineMovesFile,
  liveProjectRoot,
  headPolicyFile,
  runTasks = runScheduler,
}) {
  if (typeof liveProjectRoot !== 'string' || liveProjectRoot.length === 0) {
    throw new TypeError('liveProjectRoot is required');
  }

  const { tasks, toolErrors } = prepareTasks(analyzers, {
    projectRoot,
    policyRoot,
    toolRoot,
    snapshot,
    baselineRoot,
    baselineMovesFile,
    liveProjectRoot,
  });

  const scheduled = scheduleTasks(tasks, { runTasks, headPolicyFile, snapshot });
  return namedRun(scheduled, toolErrors, { projectRoot, liveProjectRoot, snapshot });
}

function namedRun(scheduled, toolErrors, { projectRoot, liveProjectRoot, snapshot }) {
  const snapshotRoot = projectRoot === liveProjectRoot ? undefined : { projectRoot, snapshot };
  return {
    reports: namedReports(scheduled.reports, snapshotRoot),
    timings: scheduled.timings,
    toolErrors: namedToolErrors([...toolErrors, ...scheduled.toolErrors], snapshotRoot),
    skipped: scheduled.skipped,
  };
}

function scheduleTasks(tasks, { runTasks, headPolicyFile, snapshot }) {
  const outcome = {
    reports: new Map(),
    timings: new Map(),
    toolErrors: [],
    skipped: new Map(),
  };
  if (tasks.length === 0) {
    return outcome;
  }
  try {
    const scheduled = runTasks(tasks, headPolicyFile, { snapshot });
    for (const [name, report] of scheduled.reports) {
      outcome.reports.set(name, report);
    }
    for (const error of scheduled.errors) {
      outcome.toolErrors.push({ tool: error.name, snapshot, message: error.message });
    }
    for (const { name, because } of scheduled.skipped ?? []) {
      outcome.skipped.set(name, because);
    }
    for (const timing of scheduled.timings) {
      outcome.timings.set(timing.name, timing.elapsedMs);
    }
  } catch (error) {
    outcome.toolErrors.push({
      tool: 'analyzer-scheduler',
      snapshot,
      message: describeError(error),
    });
  }
  return outcome;
}

export function runScheduler(tasks, headPolicyFile, { progress } = {}) {
  const liveProgress = Number.isInteger(progress?.stream.fd);
  const result = withSharedBuildDirectory((sharedEnvironment) =>
    spawnSyncWithOutputFile(process.execPath, [schedulerPath], {
      input: JSON.stringify({
        tasks: liveProgress ? withProgressLabel(tasks, progress.label) : tasks,
      }),
      stdio: ['pipe', 'pipe', 'pipe', ...(liveProgress ? [progress.stream.fd] : [])],
      env: {
        ...process.env,
        ...(headPolicyFile === undefined ? {} : headPolicyEnvironment(headPolicyFile)),
        ...sharedEnvironment,
      },
      encoding: 'utf8',
      maxBuffer: tasks.length * MAX_ANALYZER_OUTPUT_BYTES + SCHEDULER_OUTPUT_OVERHEAD_BYTES,
    }),
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`Analyzer scheduler crashed with exit ${String(result.status)}: ${detail}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error('Analyzer scheduler returned invalid JSON', {
      cause: error,
    });
  }
}

function withProgressLabel(tasks, label) {
  return tasks.map((task) => ({ ...task, progress: { label } }));
}

function prepareTasks(analyzers, context) {
  const toolErrors = [];
  const tasks = [];

  for (const [index, analyzer] of analyzers.entries()) {
    const name = analyzerName(analyzer, index);
    try {
      tasks.push(createTask(analyzer, context));
    } catch (error) {
      recoverAnalyzerVersion(analyzer);
      toolErrors.push({
        tool: name,
        snapshot: context.snapshot,
        message: describeError(error),
      });
    }
  }

  return { tasks, toolErrors };
}

function createTask(analyzer, context) {
  const { projectRoot, policyRoot, toolRoot, snapshot, liveProjectRoot } = context;
  resolveAnalyzerMetadata(analyzer, { liveProjectRoot, policyRoot });
  validateAnalyzer(analyzer);
  const invocation = analyzer.createInvocation({
    projectRoot,
    policyRoot: analyzer.policyFromPackage === true ? PACKAGE_ROOT : policyRoot,
    projectPolicyRoot: policyRoot,
    toolRoot,
    snapshot,
    baselineRoot: context.baselineRoot,
    baselineMovesFile: context.baselineMovesFile,
    liveProjectRoot,
  });
  validateInvocation(analyzer.name, invocation);
  return {
    name: analyzer.name,
    dependencies: analyzer.dependencies ?? [],
    toleratedDependencyErrors: analyzer.toleratedDependencyErrors ?? [],
    concurrencyWeight: analyzer.concurrencyWeight ?? 1,
    concurrencyGroup: analyzer.concurrencyGroup,
    executionPriority: analyzer.executionPriority ?? 0,
    timeoutMs: analyzer.timeoutMs ?? DEFAULT_ANALYZER_TIMEOUT_MS,
    reportedTools: analyzer.reportedTools ?? [],
    acceptedExitCodes: [0, ...(analyzer.findingExitCodes ?? [])],
    invocation,
  };
}

function includeDependencies(analyzer, { analyzersByName, selectedNames, pendingNames }) {
  for (const dependencyName of analyzer.dependencies ?? []) {
    const dependency = analyzersByName.get(dependencyName);
    if (dependency === undefined) {
      throw new Error(`Analyzer ${analyzer.name} requires unknown analyzer ${dependencyName}`);
    }
    if (!selectedNames.has(dependencyName)) {
      selectedNames.add(dependencyName);
      pendingNames.push(dependencyName);
    }
  }
}

function recoverAnalyzerVersion(analyzer) {
  if (typeof analyzer?.resolveVersion === 'function' && analyzer.version === 'unresolved') {
    analyzer.version = 'unknown';
  }
}
