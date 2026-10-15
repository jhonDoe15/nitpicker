import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_LEGACY_INVENTORY } from '../preset/coding-standards/inventory-path.mjs';
import { parsePositiveNumber } from '../preset/quality-checks.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../shared/policy.mjs';
import { evaluateBaselineExpansions } from '../../../shared/rules/baseline-expansion.mjs';
import { evaluateCoupling } from '../../../shared/rules/coupling.mjs';
import {
  addMetric,
  hash,
  nextOccurrence,
  positiveInteger,
  summaryMetrics,
  TESTS_FAILED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
  TYPECHECK_FAILED_SKIPPED_RULE,
} from '../../../shared/rules/finding-helpers.mjs';
import { evaluateStructure } from '../../../shared/rules/structure.mjs';
import { evaluateTestRuntime } from '../../../shared/rules/test-runtime.mjs';
import { branchCoverageFindings } from '../../../shared/rules/branch-coverage.mjs';
import { crapFindings } from '../../../shared/rules/crap.mjs';
import { mutantFindings } from '../../../shared/rules/mutation.mjs';
import { existingRoots } from '../preset/layout.mjs';
import { readLayout } from '../preset/head-policy.mjs';
import { EXCLUDED_PATH_PATTERN } from '../preset/dependency-graph/cruise.mjs';
import { loadDependencyGraph } from './dependency-graph/project-dependency-graph.mjs';
import { typescriptFileLimitFindings } from '../preset/structure/file-limits.mjs';
import { normalizeDuplicates } from '../preset/duplicates/normalize.mjs';
import { spawnedEntryFiles } from './spawned-entries.mjs';
import { MUTATION_REPORT_PATH, mutationTargets } from './mutation-scope.mjs';
import { testedSourceModules } from './test-weakening/tested-modules.mjs';
import {
  baseMutationTargets,
  changedCodeMutants,
  hasWeakeningCandidates,
  mutationTargetsWithTestedModules,
  weakenedTestFindings,
} from './test-weakening/weakened-mutants.mjs';
import { crapUnknownMessage } from './quality-messages/crap-unknown-message.mjs';
import { unhandledErrors, unhandledErrorText } from './quality-messages/failure-text.mjs';
import { formatVitestFailures, vitestFailures } from './quality-messages/vitest-failures.mjs';

export { formatVitestFailures };
import {
  layoutJscpdConfig,
  layoutKnipConfig,
  layoutTransformFor,
} from '../preset/tool-configs.mjs';
import { trackTemporaryPath } from '../../../core/tooling/temporary-files.mjs';
import {
  PACKAGE_ROOT,
  resolveTool,
  SNAPSHOT_DIRECTORY_NAMES,
  toolNameForPath,
} from '../../../core/tooling/tool-resolution.mjs';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const TRUSTED_TOOL_ROOT = PACKAGE_ROOT;
const QUALITY_AREA_RUNNERS = new Map([
  ['policy-tests', runPolicyTests],
  ['coding-standards', runCodingStandards],
  ['coupling', runCoupling],
  ['test-runtime', runTestRuntime],
  ['structure', runStructure],
  ['duplicates', runDuplicates],
  ['dead-code', runDeadCode],
  ['coverage', runCoverage],
  ['crap', runCrap],
  ['mutation', runMutation],
]);
const STRYKER_TSCONFIG_TARGET = '.nitpicker-diff-tsconfig.stryker.json';
const STRYKER_CONFIG_PATH = 'languages/typescript/preset/defaults/stryker.config.mjs';
const COVERAGE_REPORT_PATH = 'reports/quality/coverage/coverage-final.json';
const INITIAL_TEST_RUN_FAILED_PATTERN =
  /failed tests in the initial test run|Something went wrong in the initial test run/u;
const DRY_RUN_TYPECHECK_FAILED_PATTERN = /Typescript error\(s\) found in dry run compilation/u;
const STRUCTURE_HINTS = {
  lines:
    'Nested functions count: move inner functions to module level, passing what they close over as one object.',
};

const DEAD_CODE_DECLARATIONS = new Map([
  ['exports', 'Export'],
  ['types', 'Exported type'],
]);
const ENFORCED_DEAD_CODE_CATEGORIES = new Set(['files', 'exports', 'types']);

export async function runQualityArea(options) {
  const runner = QUALITY_AREA_RUNNERS.get(options.kind);
  if (runner === undefined) {
    throw new Error(`Unsupported quality area: ${options.kind}`);
  }
  if (options.kind !== 'policy-tests') {
    const layout = readLayout();
    const files = layout.projectCodeFiles(options.projectRoot);
    if (files.length === 0) return [];
    if (['coupling', 'crap', 'mutation'].includes(options.kind) && !files.some(layout.isSourceFile))
      return [];
    if (
      ['test-runtime', 'coverage', 'mutation'].includes(options.kind) &&
      !files.some(layout.isRunnableTestFile)
    )
      return [];
  }
  return runner(options);
}

function runPolicyTests(options) {
  if (options.snapshot === 'base') {
    return [];
  }
  runNodeTool({
    options,
    relativeToolPath: 'vitest/vitest.mjs',
    arguments_: ['run', '--config', path.join(options.policyRoot, 'vitest.config.mts')],
    cwd: options.policyRoot,
    acceptedStatuses: [0],
  });
  return [];
}

async function runCodingStandards(options) {
  const checker = await importPolicyModule(
    options,
    'languages/typescript/preset/coding-standards/check.mjs',
  );
  const baselineRelativePath = options.legacyInventory;
  const baseline = readOptionalBaseline(options.projectPolicyRoot, baselineRelativePath);
  const signals = [
    ...(await checker.collectSignals(options.projectRoot, options.policyRoot)),
    ...checker.collectArchitectureSignals(options.projectRoot),
  ];
  const findings = checker.compareSignals(signals, baseline.sites).map((signal) => ({
    tool: options.analyzerName,
    rule: signal.rule,
    path: signal.file,
    identity: `source:${hash(signal.source)}|count:${String(signal.count)}`,
    message: `New coding-standard site: ${signal.source}`,
    classification: 'enforceable',
  }));
  if (options.snapshot === 'head' && options.baselineRoot !== undefined) {
    const baseBaseline = readOptionalBaseline(options.baselineRoot, baselineRelativePath);
    findings.push(
      ...normalizeBaselineExpansions(baseBaseline.sites, baseline.sites, options.analyzerName),
    );
  }
  return findings;
}

function readOptionalBaseline(root, relativePath) {
  const baselinePath = path.join(root, relativePath);
  if (!existsSync(baselinePath)) {
    return { sites: [] };
  }
  return parseReportJson(readFileSync(baselinePath, 'utf8'));
}

async function perSourceRoot(options, layout, analyze) {
  const roots = existingRoots(options.projectRoot, layout.sourceRoots);
  const groups = await Promise.all(
    roots.map(async (root) => prefixAggregates(root, roots.length, await analyze(root))),
  );
  return groups.flat();
}

function prefixAggregates(root, rootCount, findings) {
  return rootCount === 1
    ? findings
    : findings.map((finding) =>
        finding.path === '.' ? { ...finding, identity: `${root}|${finding.identity}` } : finding,
      );
}

async function runCoupling(options) {
  const layout = readLayout();
  const graph = runDependencyCruiser(options, layout);
  const { analyzeCoupling } = await importPolicyModule(
    options,
    'languages/typescript/preset/coupling/analyze.mjs',
  );
  return perSourceRoot(options, layout, (root) =>
    normalizeCoupling(analyzeCoupling(graph, root, { layout }), options.analyzerName),
  );
}

async function runTestRuntime(options) {
  const layout = readLayout();
  const graph = runDependencyCruiser(options, layout);
  const analyzer = await importPolicyModule(
    options,
    'languages/typescript/preset/test-runtime/analyze.mjs',
  );
  const sourceTexts = await analyzer.loadModuleSources(graph, options.projectRoot);
  const report = analyzer.analyzeTestRuntime(graph, {
    layout,
    productionRoots: layout.sourceRoots,
    sourceTexts,
  });
  report.findings = report.findings.map((finding) => ({
    ...finding,
    sourceHash: hash(sourceTexts.get(finding.test) ?? ''),
  }));
  return normalizeTestRuntime(report, options.analyzerName);
}

async function runStructure(options) {
  const { analyzeProductionFiles } = await importPolicyModule(
    options,
    'languages/typescript/preset/structure/analyze.mjs',
  );
  const layout = readLayout();
  const functionFindings = await perSourceRoot(options, layout, (root) =>
    normalizeStructure(
      withFunctionSourceHashes(
        analyzeProductionFiles(path.join(options.projectRoot, root), root, { layout }),
        options.projectRoot,
      ),
      options.analyzerName,
    ),
  );
  return [
    ...functionFindings,
    ...typescriptFileLimitFindings(options.projectRoot, options.analyzerName),
  ];
}

function runDuplicates(options) {
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-jscpd.json');
  const outputDirectory = path.join(options.projectRoot, 'reports/quality/duplicates');
  const layout = readLayout();
  const config = layoutJscpdConfig(
    parseReportJson(
      readFileSync(
        path.join(options.policyRoot, 'languages/typescript/preset/defaults/jscpd.json'),
        'utf8',
      ),
    ),
    layout,
  );
  config.path = existingRoots(options.projectRoot, config.path);
  if (config.path.length === 0) return [];
  trackTemporaryPath(configPath);
  writeFileSync(
    configPath,
    `${JSON.stringify({ ...config, absolute: true, reporters: ['json'], output: outputDirectory })}\n`,
  );
  try {
    runNodeTool({
      options,
      relativeToolPath: 'jscpd/run-jscpd.js',
      arguments_: ['--config', configPath],
      acceptedStatuses: [0],
    });
    const report = JSON.parse(
      readFileSync(path.join(outputDirectory, 'jscpd-report.json'), 'utf8'),
    );
    return normalizeDuplicates(
      withProjectRelativeNames(report, realpathSync(options.projectRoot)),
      options.analyzerName,
      { configuredPaths: [] },
    );
  } finally {
    unlinkSync(configPath);
  }
}

function projectRelativeSide(side, projectRoot) {
  return typeof side?.name === 'string' && path.isAbsolute(side.name)
    ? { ...side, name: path.relative(projectRoot, side.name) }
    : side;
}

function withProjectRelativeNames(report, projectRoot) {
  return {
    ...report,
    duplicates: (report.duplicates ?? []).map((duplicate) => ({
      ...duplicate,
      firstFile: projectRelativeSide(duplicate.firstFile, projectRoot),
      secondFile: projectRelativeSide(duplicate.secondFile, projectRoot),
    })),
  };
}

function withSpawnedEntries(config, projectRoot) {
  return { ...config, entry: [...config.entry, ...spawnedEntryFiles(projectRoot)] };
}

function runDeadCode(options) {
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-knip.json');
  trackTemporaryPath(configPath);
  writeFileSync(
    configPath,
    `${JSON.stringify(
      withSpawnedEntries(
        layoutKnipConfig(
          parseReportJson(
            readFileSync(
              path.join(options.policyRoot, 'languages/typescript/preset/defaults/knip.json'),
              'utf8',
            ),
          ),
          readLayout(),
        ),
        options.projectRoot,
      ),
      null,
      2,
    )}\n`,
  );
  try {
    const result = runNodeTool({
      options,
      relativeToolPath: 'knip/bin/knip.js',
      arguments_: ['--config', configPath, '--reporter', 'json'],
      acceptedStatuses: [0, 1],
    });
    return normalizeDeadCode(
      withDeadCodeSourceHashes(JSON.parse(result.stdout), options.projectRoot),
      options.analyzerName,
    );
  } finally {
    unlinkSync(configPath);
  }
}

function runCoverage(options) {
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-vitest.config.ts');
  const testReportPath = path.join(options.projectRoot, '.nitpicker-diff-vitest-report.json');
  if (existsSync(testReportPath)) {
    throw new Error(`Temporary coverage report already exists: ${testReportPath}`);
  }
  trackTemporaryPath(configPath);
  trackTemporaryPath(testReportPath);
  writeFileSync(
    configPath,
    readFileSync(
      path.join(
        options.policyRoot,
        'languages/typescript/preset/defaults/vitest.quality.config.ts',
      ),
      'utf8',
    ),
  );
  try {
    const result = runNodeTool({
      options,
      relativeToolPath: 'vitest/vitest.mjs',
      arguments_: [
        'run',
        '--config',
        configPath,
        '--coverage',
        '--testTimeout',
        '10000',
        '--reporter',
        'dot',
        '--reporter',
        'json',
        `--outputFile.json=${testReportPath}`,
      ],
      acceptedStatuses: [0, 1],
    });
    if (result.status !== 0) {
      return coverageFailureFindings(options, readVitestReport(testReportPath, result), result);
    }
    return readCoverageFindings(options, testReportPath);
  } finally {
    rmSync(testReportPath, { force: true });
    rmSync(configPath, { force: true });
  }
}

export function coverageFailureFindings(options, report, result) {
  const [firstFailure] = vitestFailures(report, options.projectRoot);
  const unhandled = unhandledErrors(result.stderr);
  if (firstFailure === undefined && unhandled.length > 0) {
    return [
      toolErrorFinding(options, {
        rule: TESTS_FAILED_RULE,
        path: unhandled[0].file === undefined ? '.' : findingPath(unhandled[0].file),
        message: unhandledErrorText(unhandled),
      }),
    ];
  }
  if (firstFailure === undefined) {
    throw new Error(
      `Vitest exited ${String(result.status)} without naming a failing test${formatProcessOutput(result)}`,
    );
  }
  return [
    toolErrorFinding(options, {
      rule: TESTS_FAILED_RULE,
      path: findingPath(firstFailure.file),
      message: formatVitestFailures(report, options.projectRoot),
    }),
  ];
}

function readCoverageFindings(options, testReportPath) {
  const report = JSON.parse(
    readFileSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH), 'utf8'),
  );
  const testReport = JSON.parse(readFileSync(testReportPath, 'utf8'));
  return normalizeCoverage(
    withBranchSourceHashes(report, options.projectRoot),
    options.analyzerName,
    { projectRoot: options.projectRoot, testCount: testReport.numTotalTests },
  );
}

function readVitestReport(reportPath, result) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Vitest exited ${String(result.status)} without a readable test report: ${error instanceof Error ? error.message : String(error)}${formatProcessOutput(result)}`,
      { cause: error },
    );
  }
}

function toolErrorFinding(options, { rule, path: findingPath = '.', message }) {
  return {
    tool: options.analyzerName,
    rule,
    path: findingPath,
    identity: rule,
    message,
    classification: 'tool-error',
  };
}

function findingPath(file) {
  return file.startsWith('<') || file.startsWith('..') || path.isAbsolute(file) ? '.' : file;
}

function formatProcessOutput(result) {
  const output = [result.stderr, result.stdout]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .join('\n');
  return output.length > 0 ? `\nProcess output:\n${output}` : '';
}

function hasRunnableTests(options) {
  const layout = readLayout();
  return layout.projectCodeFiles(options.projectRoot).some(layout.isRunnableTestFile);
}

function runCrap(options) {
  if (
    !existsSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH)) &&
    hasRunnableTests(options)
  ) {
    return [
      toolErrorFinding(options, {
        rule: TESTS_FAILED_SKIPPED_RULE,
        message: 'CRAP did not run: there is no coverage report, because the project tests fail.',
      }),
    ];
  }
  runNodeTool({
    options,
    absoluteToolPath: path.join(options.policyRoot, 'languages/typescript/preset/crap/report.mjs'),
    arguments_: [],
    cwd: options.projectRoot,
    environment: { NITPICKER_PROJECT_ROOT: options.projectRoot },
    acceptedStatuses: [0],
  });
  const report = parseReportJson(
    readFileSync(path.join(options.projectRoot, 'reports/quality/crap/report.json'), 'utf8'),
  );
  return normalizeCrap(
    withFunctionSourceHashes(report, options.projectRoot),
    options.analyzerName,
    {
      scoreLimit: options.crapScoreLimit,
    },
  );
}

async function runMutation(options) {
  const layout = readLayout();
  const targets = mutationTargets(options, layout);
  const testedModules = testedSourceModules(options, layout);
  if (targets?.length === 0 && testedModules.length === 0) return [];
  const mutationScope = { targets: targets ?? [], testedModules };
  const head = await mutationReport(
    options,
    targets && mutationTargetsWithTestedModules(targets, testedModules),
  );
  if (head.skipped !== undefined) return head.skipped;
  const changed = normalizeMutation(
    changedCodeMutants(head.report, mutationScope),
    options.analyzerName,
  );
  return [...changed, ...(await weakenedTestsFindings(options, head.report, mutationScope))];
}

async function weakenedTestsFindings(options, headReport, mutationScope) {
  if (!hasWeakeningCandidates(headReport, mutationScope)) return [];
  const baseOptions = { ...options, projectRoot: options.baselineRoot, snapshot: 'base' };
  const base = await mutationReport(baseOptions, baseMutationTargets(headReport, mutationScope));
  if (base.skipped !== undefined) return base.skipped;
  return weakenedTestFindings({
    headReport,
    baseReport: base.report,
    mutationScope,
    analyzerName: options.analyzerName,
  });
}

async function mutationReport(options, targets) {
  const sourceConfig = (
    await importPolicyModule(options, STRYKER_CONFIG_PATH, `?run=${Date.now().toString()}`)
  ).default;
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-stryker.config.mjs');
  const createdFiles = [];
  try {
    writeStrykerConfig({ options, sourceConfig, targets, configPath, createdFiles });
    const skipped = runStrykerOrExplainSkip(options, configPath);
    if (skipped !== undefined) return { skipped };
    return {
      report: withMutationSourceHashes(
        readMutationReport(options.projectRoot),
        options.projectRoot,
      ),
    };
  } finally {
    for (const filePath of createdFiles.reverse()) {
      rmSync(filePath, { force: true });
    }
  }
}

function writeStrykerConfig({ options, sourceConfig, targets, configPath, createdFiles }) {
  const typeChecked = options.snapshot !== 'base';
  const tsconfigPath = typeChecked
    ? installStrykerTsconfig(options, sourceConfig.tsconfigFile, createdFiles)
    : undefined;
  const vitestConfigPath = installMutationCompanion(
    options,
    [sourceConfig.vitest?.configFile, '.nitpicker-diff-stryker.vitest.config.ts'],
    createdFiles,
  );
  const config = {
    ...rebaseMutationConfig(sourceConfig, {
      tsconfigFile: tsconfigPath && relativeProjectPath(options.projectRoot, tsconfigPath),
      vitestConfigFile: relativeProjectPath(options.projectRoot, vitestConfigPath),
    }),
    ...(targets === undefined ? {} : { mutate: targets }),
    ...(typeChecked ? {} : { checkers: [] }),
    reporters: ['json'],
    jsonReporter: { fileName: MUTATION_REPORT_PATH },
  };
  writeTemporaryFile(
    configPath,
    `export default ${JSON.stringify(config, null, 2)};\n`,
    createdFiles,
  );
}

const SKIP_MESSAGES = {
  head: {
    typecheck:
      'mutation skipped: the change does not type-check (see typescript-typecheck findings)',
    tests: 'mutation skipped: tests fail (see coverage findings)',
  },
  base: {
    typecheck:
      'mutation skipped: the base commit does not type-check, so its mutants cannot be compared. Fix the base first; a missing @types/node is the usual cause.',
    tests:
      'mutation skipped: the base commit fails its own tests, so its mutants cannot be compared. Fix the base first.',
  },
};

export function mutationSkipFor(errorMessage, snapshot = 'head') {
  const messages = SKIP_MESSAGES[snapshot];
  if (DRY_RUN_TYPECHECK_FAILED_PATTERN.test(errorMessage)) {
    return { rule: TYPECHECK_FAILED_SKIPPED_RULE, message: messages.typecheck };
  }
  return INITIAL_TEST_RUN_FAILED_PATTERN.test(errorMessage)
    ? { rule: TESTS_FAILED_SKIPPED_RULE, message: messages.tests }
    : undefined;
}

function runStrykerOrExplainSkip(options, configPath) {
  try {
    runNodeTool({
      options,
      relativeToolPath: '@stryker-mutator/core/bin/stryker.js',
      arguments_: ['run', configPath],
      acceptedStatuses: [0],
    });
    return undefined;
  } catch (error) {
    const skip =
      error instanceof Error ? mutationSkipFor(error.message, options.snapshot) : undefined;
    if (skip === undefined) {
      throw error;
    }
    return [toolErrorFinding(options, skip)];
  }
}

function readMutationReport(projectRoot) {
  return JSON.parse(readFileSync(path.join(projectRoot, MUTATION_REPORT_PATH), 'utf8'));
}

export function normalizeBaselineExpansions(baseSites, headSites, analyzerName) {
  return evaluateBaselineExpansions(baseSites, headSites, analyzerName);
}

export function normalizeCoupling(report, analyzerName) {
  return evaluateCoupling(
    {
      ...report,
      modules: report.modules?.map(({ source, ...metrics }) => ({ file: source, ...metrics })),
    },
    analyzerName,
  );
}

export function normalizeTestRuntime(report, analyzerName) {
  return evaluateTestRuntime(report, analyzerName);
}

export function normalizeStructure(report, analyzerName) {
  return evaluateStructure(
    {
      ...report,
      functions: report.functions?.map(({ source, function: name, ...metrics }) => ({
        file: source,
        name,
        ...metrics,
      })),
      classes: report.classes?.map(({ source, class: name, ...metrics }) => ({
        file: source,
        name,
        ...metrics,
      })),
    },
    analyzerName,
    { hints: STRUCTURE_HINTS },
  );
}

export function normalizeDeadCode(report, analyzerName) {
  const findings = [];
  const occurrences = new Map();
  for (const file of report.files ?? []) {
    const filePath = typeof file === 'string' ? file : file?.path;
    if (typeof filePath !== 'string' || filePath.length === 0) {
      continue;
    }
    findings.push({
      tool: analyzerName,
      rule: 'files',
      path: filePath,
      identity: `file:${filePath}|source:${file?.sourceHash ?? hash(filePath)}`,
      message: `Unused file: ${filePath}. Nothing imports it: delete it, or import it where it is needed.`,
      classification: 'enforceable',
    });
  }
  for (const issue of report.issues ?? []) {
    for (const [category, entries] of Object.entries(issue)) {
      if (category === 'file' || !Array.isArray(entries)) {
        continue;
      }
      for (const entry of entries) {
        const name = typeof entry === 'string' ? entry : entry?.name;
        if (typeof name !== 'string' || name.length === 0) {
          continue;
        }
        const key = `${issue.file}\0${category}\0${name}`;
        const occurrence = nextOccurrence(occurrences, key);
        findings.push({
          tool: analyzerName,
          rule: category,
          path: issue.file,
          identity: `name:${name}|occurrence:${String(occurrence)}${
            ENFORCED_DEAD_CODE_CATEGORIES.has(category)
              ? `|source:${entry?.sourceHash ?? hash(issue.file)}`
              : ''
          }`,
          message: deadCodeMessage(category, name, entry),
          classification: ENFORCED_DEAD_CODE_CATEGORIES.has(category)
            ? 'enforceable'
            : 'descriptive',
          ...(positiveInteger(entry?.line) === undefined
            ? {}
            : {
                location: {
                  line: entry.line,
                  column: positiveInteger(entry.col) ?? 1,
                },
              }),
        });
      }
    }
  }
  return findings;
}

function deadCodeMessage(category, name, entry) {
  const kind = DEAD_CODE_DECLARATIONS.get(category);
  if (kind === undefined) {
    return `${category}: ${name}`;
  }
  return entry?.usedInFile === true
    ? `${kind} ${name} is only used in its own file. Remove \`export\`.`
    : `${kind} ${name} is never imported. Remove \`export\`, or the ${category === 'types' ? 'type' : 'declaration'} if nothing uses it.`;
}

export function normalizeCoverage(report, analyzerName, { projectRoot, testCount } = {}) {
  const findings = [];
  let coveredBranchOutcomes = 0;
  for (const [absolutePath, coverage] of Object.entries(report)) {
    const relativePath = path.relative(projectRoot, absolutePath).replaceAll('\\', '/');
    coveredBranchOutcomes += addFileCoverage(findings, coverage, { analyzerName, relativePath });
  }
  if (Number.isInteger(testCount) && testCount > 0) {
    addTestEfficiency(findings, analyzerName, { coveredBranchOutcomes, testCount });
  }
  return findings;
}

function addFileCoverage(findings, coverage, { analyzerName, relativePath }) {
  const branchEntries = Object.entries(coverage.b ?? {});
  const branchOutcomes = branchEntries.flatMap(([, outcomes]) => outcomes);
  addMetric(findings, {
    analyzerName,
    rule: 'coverage',
    path: relativePath,
    identity: 'branches',
    message: `Branch coverage for ${relativePath}`,
    metricName: 'branches',
    value: coveragePercent(branchOutcomes),
  });
  const branches = branchEntries.map(([branchId, outcomes]) => ({
    path: relativePath,
    key:
      coverage.branchSourceHashes?.[branchId] ??
      hash(JSON.stringify(coverage.branchMap?.[branchId] ?? { branchId })),
    percent: coveragePercent(outcomes),
    line: coverage.branchMap?.[branchId]?.loc?.start?.line,
    arms: coverage.uncoveredArms?.[branchId],
  }));
  findings.push(
    ...branchCoverageFindings(branches, {
      tool: analyzerName,
      identify: (key, occurrence) => `branch-source:${key}:occurrence:${String(occurrence)}`,
    }),
  );
  return branchOutcomes.filter((value) => value > 0).length;
}

function addTestEfficiency(findings, analyzerName, { coveredBranchOutcomes, testCount }) {
  addMetric(findings, {
    analyzerName,
    rule: 'test-efficiency',
    path: '.',
    identity: 'covered-branches-per-test',
    message: 'Covered branch outcomes per test',
    metricName: 'coveredBranchesPerTest',
    value: coveredBranchOutcomes / testCount,
  });
  addMetric(findings, {
    analyzerName,
    rule: 'test-efficiency',
    path: '.',
    identity: 'test-count',
    message: 'Executed test count',
    metricName: 'testCount',
    value: testCount,
  });
}

export function normalizeCrap(
  report,
  analyzerName,
  { scoreLimit = DEFAULT_CRAP_SCORE_LIMIT } = {},
) {
  const findings = summaryMetrics(analyzerName, report.summary, 'crap');
  const occurrences = new Map();
  const functions = [...(report.functions ?? [])].sort(compareCrapSites);
  for (const entry of functions) {
    const occurrence = nextOccurrence(occurrences, `${entry.source}\0${entry.function}`);
    addCrapFunction(findings, entry, { analyzerName, scoreLimit, occurrence });
  }
  return findings;
}

function compareCrapSites(left, right) {
  return (
    left.source.localeCompare(right.source) ||
    (left.lines?.start ?? 0) - (right.lines?.start ?? 0) ||
    (left.lines?.end ?? 0) - (right.lines?.end ?? 0) ||
    left.function.localeCompare(right.function)
  );
}

function addCrapFunction(findings, entry, { analyzerName, scoreLimit, occurrence }) {
  const sourceHash =
    entry.sourceHash ??
    hash(`${entry.source}:${String(entry.lines?.start)}:${String(entry.lines?.end)}`);
  const violationIdentity = `function:${entry.function}:occurrence:${String(occurrence)}:source:${sourceHash}`;
  findings.push(
    ...crapFindings(
      [
        {
          path: entry.source,
          name: entry.function,
          identity: violationIdentity,
          ratchetKey: `function:${entry.function}:occurrence:${String(occurrence)}:crap`,
          line: entry.lines?.start,
          crap: entry.crap,
        },
      ],
      { tool: analyzerName, limit: scoreLimit, unknownMessage: crapUnknownMessage(entry.source) },
    ),
  );
  const values = {
    complexity: entry.complexity,
    statementCoverage: entry.statementCoverage?.percent,
    branchCoverage: entry.branchCoverage?.percent,
    effectiveCoverage: entry.effectiveCoverage?.percent,
    crap: entry.crap,
  };
  for (const [metricName, value] of Object.entries(values)) {
    addMetric(findings, {
      analyzerName,
      rule: 'function-crap',
      path: entry.source,
      identity: `function:${entry.function}:occurrence:${String(occurrence)}:${metricName}`,
      message: `${metricName} for ${entry.function}`,
      metricName,
      value,
      symbol: entry.function,
      line: entry.lines?.start,
    });
  }
}

export function normalizeMutation(report, analyzerName) {
  const mutants = [];
  const statusCounts = new Map();
  const occurrences = new Map();
  for (const [filePath, file] of Object.entries(report.files ?? {})) {
    collectFileMutants(file, { filePath, mutants, statusCounts, occurrences });
  }
  const findings = mutantFindings(mutants, { tool: analyzerName });
  for (const [status, value] of statusCounts) {
    addMetric(findings, {
      analyzerName,
      rule: 'mutation-summary',
      path: '.',
      identity: `status:${status}`,
      message: `${status} mutants`,
      metricName: status,
      value,
    });
  }
  return findings;
}

function collectFileMutants(file, { filePath, mutants, statusCounts, occurrences }) {
  for (const mutant of file.mutants ?? []) {
    const status = mutant.status ?? 'Unknown';
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    if (status !== 'Killed') {
      mutants.push(neutralMutant(mutant, { filePath, status, occurrences }));
    }
  }
}

function neutralMutant(mutant, { filePath, status, occurrences }) {
  const semanticIdentity = [
    mutant.mutatorName ?? 'unknown',
    hash(mutant.replacement ?? ''),
    mutant.sourceHash ?? hash(filePath),
  ].join('|');
  const occurrence = nextOccurrence(occurrences, `${filePath}\0${status}\0${semanticIdentity}`);
  return {
    path: filePath,
    identity: `${semanticIdentity}|occurrence:${String(occurrence)}`,
    status,
    ...(status === 'Ignored' ? { hiddenByComment: true } : {}),
    label: mutant.mutatorName ?? 'mutant',
    line: mutant.location?.start?.line,
    ...(positiveInteger(mutant.location?.start?.column) === undefined
      ? {}
      : { column: mutant.location.start.column }),
    ...(typeof mutant.original === 'string' && mutant.original.length > 0
      ? { original: mutant.original }
      : {}),
    ...(mutant.replacement === undefined ? {} : { replacement: mutant.replacement }),
  };
}

function coveragePercent(values) {
  if (values.length === 0) {
    return 100;
  }
  return (values.filter((value) => value > 0).length / values.length) * 100;
}

function withFunctionSourceHashes(report, projectRoot) {
  const sourceTexts = new Map();
  return {
    ...report,
    functions: (report.functions ?? []).map((entry) => {
      let source = sourceTexts.get(entry.source);
      if (source === undefined) {
        source = readProjectSource(projectRoot, entry.source);
        sourceTexts.set(entry.source, source);
      }
      return {
        ...entry,
        sourceHash: hash(
          sourceLineRange(source, entry.start ?? entry.lines?.start, entry.end ?? entry.lines?.end),
        ),
      };
    }),
  };
}

function withBranchSourceHashes(report, projectRoot) {
  return Object.fromEntries(
    Object.entries(report).map(([absolutePath, coverage]) => {
      const source = readProjectSource(projectRoot, absolutePath);
      const branchSourceHashes = Object.fromEntries(
        Object.entries(coverage.branchMap ?? {}).map(([branchId, branch]) => [
          branchId,
          hash(
            JSON.stringify({
              type: branch.type,
              source: sourceLocation(source, branch.loc),
              outcomes: (branch.locations ?? []).map((location) =>
                sourceLocation(source, location),
              ),
            }),
          ),
        ]),
      );
      const uncoveredArms = Object.fromEntries(
        Object.entries(coverage.branchMap ?? {}).map(([branchId, branch]) => [
          branchId,
          describeUncoveredArms(branch, coverage.b?.[branchId], source),
        ]),
      );
      return [absolutePath, { ...coverage, branchSourceHashes, uncoveredArms }];
    }),
  );
}

export function describeUncoveredArms(branch, hits, source) {
  const locations = branch.locations ?? [];
  return (hits ?? []).flatMap((count, index) =>
    count > 0
      ? []
      : [`${armName(branch, index, source)} at ${armPosition(locations[index], branch)}`],
  );
}

function armPosition(location, branch) {
  const start = Number.isInteger(location?.start?.line) ? location.start : branch.loc?.start;
  return `${String(start?.line ?? '?')}:${String((start?.column ?? 0) + 1)}`;
}

function armName(branch, index, source) {
  switch (branch.type) {
    case 'if':
      return index === 0 ? 'the true arm of the if' : 'the false arm of the if (or its else)';
    case 'cond-expr':
      return index === 0 ? 'the true arm of the ?:' : 'the false arm of the ?:';
    case 'binary-expr':
      return `the ${index === 0 ? 'left' : 'right'} side of ${logicalOperator(branch, source)}`;
    case 'switch':
      return 'a switch case';
    case 'default-arg':
      return 'the default value';
    default:
      return 'a branch arm';
  }
}

function logicalOperator(branch, source) {
  const [first, second] = branch.locations ?? [];
  if (first?.start === undefined || second?.start === undefined) {
    return 'the logical expression';
  }
  const between = source.slice(offsetOf(source, first.start), offsetOf(source, second.start));
  return /\?\?|&&|\|\|/u.exec(between)?.[0] ?? 'the logical expression';
}

function offsetOf(source, { line, column }) {
  const precedingLines = source.split('\n').slice(0, line - 1);
  return precedingLines.reduce((total, text) => total + text.length + 1, 0) + (column ?? 0);
}

function withDeadCodeSourceHashes(report, projectRoot) {
  return {
    ...report,
    files: (report.files ?? []).map((file) => ({
      path: file,
      sourceHash: hash(readProjectSource(projectRoot, file)),
    })),
    issues: (report.issues ?? []).map((issue) => {
      const lines = readProjectSource(projectRoot, issue.file).split('\n');
      return Object.fromEntries(
        Object.entries(issue).map(([category, entries]) => [
          category,
          Array.isArray(entries)
            ? entries.map((entry) => withDeclarationSourceHash(entry, lines))
            : entries,
        ]),
      );
    }),
  };
}

function withDeclarationSourceHash(entry, lines) {
  const line = positiveInteger(entry?.line);
  if (typeof entry !== 'object' || line === undefined || line > lines.length) {
    return entry;
  }
  return {
    ...entry,
    sourceHash: hash(lines[line - 1].trim()),
    usedInFile: isUsedBesidesDeclaration(entry.name, lines, line),
  };
}

function isUsedBesidesDeclaration(name, lines, declarationLine) {
  if (typeof name !== 'string' || name.length === 0) {
    return false;
  }
  const word = new RegExp(`(?<![\\w$])${name.replaceAll('$', String.raw`\$`)}(?![\\w$])`, 'u');
  return lines.some((text, index) => index !== declarationLine - 1 && word.test(text));
}

function withMutationSourceHashes(report, projectRoot) {
  return {
    ...report,
    files: Object.fromEntries(
      Object.entries(report.files ?? {}).map(([filePath, file]) => {
        const source = readProjectSource(projectRoot, filePath);
        return [
          filePath,
          {
            ...file,
            mutants: (file.mutants ?? []).map((mutant) => ({
              ...mutant,
              sourceHash: hash(sourceLocation(source, mutant.location)),
              original: sourceSnippet(source, mutant.location),
            })),
          },
        ];
      }),
    ),
  };
}

function readProjectSource(projectRoot, relativePath) {
  return readFileSync(
    path.join(projectRoot, relativeProjectFile(projectRoot, relativePath)),
    'utf8',
  );
}

function relativeProjectFile(projectRoot, filePath) {
  const absolutePath = path.resolve(projectRoot, filePath);
  const relativePath = path.relative(projectRoot, absolutePath);
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    !lstatSync(absolutePath).isFile()
  ) {
    throw new Error(`Analyzer source path must stay within the project: ${filePath}`);
  }
  return relativePath;
}

function sourceLocation(source, location) {
  return sourceLineRange(source, location?.start?.line, location?.end?.line);
}

export function sourceSnippet(source, location) {
  const start = location?.start;
  const end = location?.end;
  if (!Number.isInteger(start?.line) || !Number.isInteger(end?.line)) {
    return undefined;
  }
  const lines = source.split(/\r?\n/);
  const first = lines[start.line - 1];
  const last = lines[end.line - 1];
  if (first === undefined || last === undefined) {
    return undefined;
  }
  return start.line === end.line
    ? first.slice(start.column - 1, end.column - 1)
    : [
        first.slice(start.column - 1),
        ...lines.slice(start.line, end.line - 1),
        last.slice(0, end.column - 1),
      ].join('\n');
}

function sourceLineRange(source, startLine, endLine) {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || endLine < startLine) {
    return '';
  }
  return source
    .split(/\r?\n/)
    .slice(startLine - 1, endLine)
    .join('\n');
}

function runDependencyCruiser(options, layout) {
  const report = loadDependencyGraph({
    projectRoot: options.projectRoot,
    policyRoot: options.policyRoot,
    liveProjectRoot: options.liveProjectRoot,
    patterns: existingRoots(options.projectRoot, layout.graphRoots),
    exclude: EXCLUDED_PATH_PATTERN,
  });
  if (!Array.isArray(report.modules)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return report;
}

function runNodeTool({ acceptedStatuses, ...invocation }) {
  const result = spawnNodeTool(invocation);
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${invocation.options.kind} exited with ${String(result.status)}: ${detail}`);
  }
  return result;
}

function spawnNodeTool({
  options,
  relativeToolPath,
  absoluteToolPath,
  arguments_,
  cwd = options.projectRoot,
  environment = {},
}) {
  const name = relativeToolPath === undefined ? undefined : toolNameForPath(relativeToolPath);
  const toolPath =
    absoluteToolPath ??
    resolveTool(name, {
      projectRoot: options.liveProjectRoot,
      bin: relativeToolPath.slice(name.length + 1),
    }).binPath;
  const result = spawnSync(process.execPath, [toolPath, ...arguments_], {
    cwd,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result;
}

async function importPolicyModule(options, relativePath, suffix = '') {
  return import(`${pathToFileURL(path.join(options.policyRoot, relativePath)).href}${suffix}`);
}

export function rebaseMutationConfig(sourceConfig, { tsconfigFile, vitestConfigFile }) {
  return {
    ...sourceConfig,
    tsconfigFile,
    vitest: {
      ...sourceConfig.vitest,
      configFile: vitestConfigFile,
    },
  };
}

export function installStrykerTsconfig(options, sourceRelativePath, createdFiles) {
  const target = [sourceRelativePath, STRYKER_TSCONFIG_TARGET];
  const tsconfigPath = installMutationCompanion(options, target, createdFiles);
  if (!typechecksCleanly(options, tsconfigPath)) {
    writeFileSync(tsconfigPath, mutationCompanionText(options, target, { strictMutants: false }));
  }
  return tsconfigPath;
}

function typechecksCleanly(options, tsconfigPath) {
  return (
    spawnNodeTool({
      options,
      relativeToolPath: 'typescript/bin/tsc',
      arguments_: ['--project', tsconfigPath, '--noEmit', '--incremental', 'false'],
    }).status === 0
  );
}

function installMutationCompanion(options, target, createdFiles) {
  const targetPath = path.join(options.projectRoot, target[1]);
  writeTemporaryFile(targetPath, mutationCompanionText(options, target), createdFiles);
  return targetPath;
}

function mutationCompanionText(options, [sourceRelativePath, targetName], transformOptions) {
  const sourcePath = policyFile(
    options.policyRoot,
    companionPath(path.posix.dirname(STRYKER_CONFIG_PATH), sourceRelativePath),
  );
  const targetPath = path.join(options.projectRoot, targetName);
  const transform = layoutTransformFor(sourceRelativePath ?? '', readLayout(), transformOptions);
  const text = readFileSync(sourcePath, 'utf8');
  return transform === undefined ? text : transform(text, targetPath);
}

function companionPath(configDirectory, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    return relativePath;
  }
  return path.posix.join(configDirectory, relativePath.replaceAll('\\', '/'));
}

function writeTemporaryFile(filePath, contents, createdFiles) {
  if (existsSync(filePath)) {
    throw new Error(`Temporary mutation config already exists: ${filePath}`);
  }
  trackTemporaryPath(filePath);
  createdFiles.push(filePath);
  writeFileSync(filePath, contents);
}

function policyFile(policyRoot, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    throw new TypeError('Mutation companion config must be a relative path');
  }
  const filePath = path.resolve(policyRoot, relativePath);
  const relativeToPolicy = path.relative(policyRoot, filePath);
  if (
    relativeToPolicy === '..' ||
    relativeToPolicy.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToPolicy) ||
    !lstatSync(filePath).isFile()
  ) {
    throw new Error(`Mutation companion config must stay within the policy root: ${relativePath}`);
  }
  return filePath;
}

function relativeProjectPath(projectRoot, filePath) {
  return path.relative(projectRoot, filePath).replaceAll('\\', '/');
}

export function parseArguments(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (value === undefined) {
      throw new Error(`${name ?? '<missing>'} requires a value`);
    }
    if (
      ![
        '--analyzer-name',
        '--kind',
        '--project-root',
        '--policy-root',
        '--tool-root',
        '--live-project-root',
        '--project-policy-root',
        '--snapshot',
        '--baseline-root',
        '--crap-score-limit',
        '--legacy-inventory',
      ].includes(name)
    ) {
      throw new Error(`Unknown quality-area adapter argument: ${name}`);
    }
    values.set(name, value);
  }
  const kind = requiredValue(values, '--kind');
  if (!QUALITY_AREA_RUNNERS.has(kind)) {
    throw new Error(`Unsupported quality area: ${kind}`);
  }
  const snapshot = requiredValue(values, '--snapshot');
  if (snapshot !== 'base' && snapshot !== 'head') {
    throw new Error('--snapshot must be base or head');
  }
  const toolRoot = realpathSync(requiredValue(values, '--tool-root'));
  if (toolRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error('--tool-root must be the project checkout containing this adapter');
  }
  const projectRoot = validatedSnapshotRoot(
    requiredValue(values, '--project-root'),
    '--project-root',
  );
  const projectPolicyValue = values.get('--project-policy-root');
  const projectPolicyRoot =
    projectPolicyValue === undefined ? projectRoot : realpathSync(path.resolve(projectPolicyValue));
  if (!lstatSync(projectPolicyRoot).isDirectory()) {
    throw new Error('--project-policy-root must be a directory');
  }
  return {
    analyzerName: requiredValue(values, '--analyzer-name'),
    kind,
    projectRoot,
    projectPolicyRoot,
    policyRoot: validatedSnapshotRoot(requiredValue(values, '--policy-root'), '--policy-root'),
    toolRoot,
    liveProjectRoot:
      values.get('--live-project-root') === undefined
        ? PACKAGE_ROOT
        : realpathSync(values.get('--live-project-root')),
    snapshot,
    legacyInventory: values.get('--legacy-inventory') ?? DEFAULT_LEGACY_INVENTORY,
    crapScoreLimit:
      values.get('--crap-score-limit') === undefined
        ? DEFAULT_CRAP_SCORE_LIMIT
        : parsePositiveNumber(values.get('--crap-score-limit'), '--crap-score-limit'),
    baselineRoot:
      values.get('--baseline-root') === undefined
        ? undefined
        : validatedSnapshotRoot(values.get('--baseline-root'), '--baseline-root'),
  };
}

function validatedSnapshotRoot(value, name) {
  const root = realpathSync(path.resolve(value));
  if (!lstatSync(root).isDirectory()) {
    throw new Error(`${name} must be a directory`);
  }
  if (root === TRUSTED_TOOL_ROOT) {
    return root;
  }
  const relativeToTemporaryRoot = path.relative(realpathSync(tmpdir()), root);
  const segments = relativeToTemporaryRoot.split(path.sep);
  if (
    relativeToTemporaryRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToTemporaryRoot) ||
    segments.length < 2 ||
    !segments[0].startsWith('nitpicker-diff-') ||
    !SNAPSHOT_DIRECTORY_NAMES.includes(segments[1])
  ) {
    throw new Error(`${name} must be inside a generated quality-diff worktree`);
  }
  return root;
}

function parseReportJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Invalid quality area JSON report', { cause: error });
  }
}

function requiredValue(values, name) {
  const value = values.get(name);
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const findings = await runQualityArea(options);
    process.stdout.write(`${JSON.stringify({ findings })}\n`);
  } catch (error) {
    process.stderr.write(
      `Quality area adapter failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
