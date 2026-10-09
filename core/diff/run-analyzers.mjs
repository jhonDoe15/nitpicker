import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { analyzerName } from './report-model.mjs';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';
import { headPolicyEnvironment } from '../../languages/typescript/preset/head-policy.mjs';

const MAX_ANALYZER_OUTPUT_BYTES = 50 * 1024 * 1024;
const SCHEDULER_OUTPUT_OVERHEAD_BYTES = 1024 * 1024;
const DEFAULT_ANALYZER_TIMEOUT_MS = 5 * 60 * 1000;
const schedulerPath = path.join(import.meta.dirname, 'analyzer-scheduler.mjs');

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
    const analyzer = analyzersByName.get(pendingName);
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

  return analyzers.filter((analyzer) => selectedNames.has(analyzer.name));
}

/** Fills in the version and configuration hash that depend on the live project and head policy. */
export function resolveAnalyzerMetadata(analyzer, { liveProjectRoot, policyRoot }) {
  if (typeof analyzer.resolveVersion === 'function') {
    analyzer.version = analyzer.resolveVersion(liveProjectRoot);
  }
  if (typeof analyzer.resolveConfigurationHash === 'function') {
    analyzer.configurationHash = analyzer.resolveConfigurationHash(policyRoot);
  }
}

/**
 * `runTasks(tasks, headPolicyFile)` runs the analyzer task graph and returns the scheduler's
 * `{ reports, errors, timings }`; it defaults to the analyzer-scheduler subprocess.
 */
export function runAnalyzers({
  analyzers,
  projectRoot,
  policyRoot,
  toolRoot,
  snapshot,
  baselineRoot,
  liveProjectRoot,
  headPolicyFile,
  runTasks = runScheduler,
}) {
  if (typeof liveProjectRoot !== 'string' || liveProjectRoot.length === 0) {
    throw new TypeError('liveProjectRoot is required');
  }

  const reports = new Map();
  const timings = new Map();
  const toolErrors = [];
  const tasks = [];

  for (const [index, analyzer] of analyzers.entries()) {
    const name = analyzerName(analyzer, index);
    try {
      resolveAnalyzerMetadata(analyzer, { liveProjectRoot, policyRoot });
      validateAnalyzer(analyzer);
      const invocation = analyzer.createInvocation({
        projectRoot,
        policyRoot: analyzer.policyFromPackage === true ? PACKAGE_ROOT : policyRoot,
        projectPolicyRoot: policyRoot,
        toolRoot,
        snapshot,
        baselineRoot,
        liveProjectRoot,
      });
      validateInvocation(analyzer.name, invocation);
      tasks.push({
        name: analyzer.name,
        dependencies: analyzer.dependencies ?? [],
        concurrencyWeight: analyzer.concurrencyWeight ?? 1,
        concurrencyGroup: analyzer.concurrencyGroup,
        executionPriority: analyzer.executionPriority ?? 0,
        timeoutMs: analyzer.timeoutMs ?? DEFAULT_ANALYZER_TIMEOUT_MS,
        reportedTools: analyzer.reportedTools ?? [],
        acceptedExitCodes: [0, ...(analyzer.findingExitCodes ?? [])],
        invocation,
      });
    } catch (error) {
      if (typeof analyzer?.resolveVersion === 'function' && analyzer.version === 'unresolved') {
        analyzer.version = 'unknown';
      }
      toolErrors.push({
        tool: name,
        snapshot,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (tasks.length > 0) {
    try {
      const scheduled = runTasks(tasks, headPolicyFile);
      for (const [name, report] of scheduled.reports) {
        reports.set(name, report);
      }
      for (const error of scheduled.errors) {
        toolErrors.push({ tool: error.name, snapshot, message: error.message });
      }
      for (const timing of scheduled.timings) {
        timings.set(timing.name, timing.elapsedMs);
      }
    } catch (error) {
      toolErrors.push({
        tool: 'analyzer-scheduler',
        snapshot,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { reports, timings, toolErrors };
}

function runScheduler(tasks, headPolicyFile) {
  const result = spawnSync(process.execPath, [schedulerPath], {
    input: JSON.stringify({ tasks }),
    env:
      headPolicyFile === undefined
        ? process.env
        : { ...process.env, ...headPolicyEnvironment(headPolicyFile) },
    encoding: 'utf8',
    maxBuffer: tasks.length * MAX_ANALYZER_OUTPUT_BYTES + SCHEDULER_OUTPUT_OVERHEAD_BYTES,
  });
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

function validateInvocation(analyzerName, invocation) {
  if (
    typeof invocation !== 'object' ||
    invocation === null ||
    typeof invocation.command !== 'string' ||
    !Array.isArray(invocation.args) ||
    invocation.args.some((argument) => typeof argument !== 'string')
  ) {
    throw new TypeError(`${analyzerName} produced an invalid process invocation`);
  }
}

function validateAnalyzer(analyzer) {
  if (typeof analyzer !== 'object' || analyzer === null) {
    throw new TypeError('Analyzer configuration must be an object');
  }
  for (const property of ['name', 'version', 'configurationHash']) {
    if (typeof analyzer[property] !== 'string' || analyzer[property].length === 0) {
      throw new TypeError(`Analyzer ${property} must be a non-empty string`);
    }
  }
  if (
    !Array.isArray(analyzer.exclusions) ||
    analyzer.exclusions.some((exclusion) => typeof exclusion !== 'string')
  ) {
    throw new TypeError(`${analyzer.name} exclusions must be an array of strings`);
  }
  if (typeof analyzer.createInvocation !== 'function') {
    throw new TypeError(`${analyzer.name} must define createInvocation`);
  }
  if (
    analyzer.dependencies !== undefined &&
    (!Array.isArray(analyzer.dependencies) ||
      analyzer.dependencies.some(
        (dependency) => typeof dependency !== 'string' || dependency.length === 0,
      ))
  ) {
    throw new TypeError(`${analyzer.name} dependencies must contain non-empty strings`);
  }
  if (
    analyzer.concurrencyWeight !== undefined &&
    (!Number.isInteger(analyzer.concurrencyWeight) || analyzer.concurrencyWeight < 1)
  ) {
    throw new TypeError(`${analyzer.name} concurrencyWeight must be a positive integer`);
  }
  if (
    analyzer.concurrencyGroup !== undefined &&
    (typeof analyzer.concurrencyGroup !== 'string' || analyzer.concurrencyGroup.length === 0)
  ) {
    throw new TypeError(`${analyzer.name} concurrencyGroup must be a non-empty string`);
  }
  if (
    analyzer.executionPriority !== undefined &&
    (!Number.isSafeInteger(analyzer.executionPriority) || analyzer.executionPriority < 0)
  ) {
    throw new TypeError(`${analyzer.name} executionPriority must be a non-negative safe integer`);
  }
  if (
    analyzer.findingExitCodes !== undefined &&
    (!Array.isArray(analyzer.findingExitCodes) ||
      analyzer.findingExitCodes.some((exitCode) => !Number.isInteger(exitCode) || exitCode < 1))
  ) {
    throw new TypeError(`${analyzer.name} findingExitCodes must contain positive integers`);
  }
  if (
    analyzer.reportedTools !== undefined &&
    (!Array.isArray(analyzer.reportedTools) ||
      analyzer.reportedTools.some((tool) => typeof tool !== 'string' || tool.length === 0))
  ) {
    throw new TypeError(`${analyzer.name} reportedTools must contain non-empty strings`);
  }
  if (
    analyzer.timeoutMs !== undefined &&
    (!Number.isInteger(analyzer.timeoutMs) || analyzer.timeoutMs < 1)
  ) {
    throw new TypeError(`${analyzer.name} timeoutMs must be a positive integer`);
  }
}
