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
import { evaluateDuplicates } from '../../../shared/rules/duplicates.mjs';
import {
  addMetric,
  hash,
  nextOccurrence,
  positiveInteger,
  summaryMetrics,
} from '../../../shared/rules/finding-helpers.mjs';
import { evaluateStructure } from '../../../shared/rules/structure.mjs';
import { evaluateTestRuntime } from '../../../shared/rules/test-runtime.mjs';
import { jscpdClones } from '../../../core/tooling/jscpd-clones.mjs';
import { branchCoverageFindings } from '../../../shared/rules/branch-coverage.mjs';
import { crapFindings } from '../../../shared/rules/crap.mjs';
import { mutantFindings } from '../../../shared/rules/mutation.mjs';
import { sourceRoot, existingRoots } from '../preset/layout.mjs';
import { readLayout } from '../preset/head-policy.mjs';
import {
  layoutJscpdConfig,
  layoutKnipConfig,
  layoutTransformFor,
} from '../preset/tool-configs.mjs';
import { trackTemporaryPath } from '../../../core/tooling/temporary-files.mjs';
import {
  PACKAGE_ROOT,
  resolveTool,
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
const DEPENDENCY_GRAPH_EXCLUSION =
  '(^|/)(node_modules|dist|build|generated|coverage|reports|target)(/|$)';
const STRYKER_CONFIG_PATH = 'languages/typescript/preset/defaults/stryker.config.mjs';
const ENFORCED_DEAD_CODE_CATEGORIES = new Set(['files', 'exports', 'types']);

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

async function runQualityArea(options) {
  const runner = QUALITY_AREA_RUNNERS.get(options.kind);
  if (runner === undefined) {
    throw new Error(`Unsupported quality area: ${options.kind}`);
  }
  if (options.kind !== 'policy-tests') {
    const layout = readLayout();
    const files = layout.projectCodeFiles(options.projectRoot);
    if (files.length === 0) return [];
    if (
      ['coupling', 'structure', 'crap', 'mutation'].includes(options.kind) &&
      !files.some(layout.isSourceFile)
    )
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
  const graph = await runDependencyCruiser(
    options,
    existingRoots(options.projectRoot, layout.sourceRoots),
    layout,
  );
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
  const graph = await runDependencyCruiser(
    options,
    existingRoots(options.projectRoot, layout.graphRoots),
    layout,
  );
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
  return perSourceRoot(options, layout, (root) =>
    normalizeStructure(
      withFunctionSourceHashes(
        analyzeProductionFiles(path.join(options.projectRoot, root), root, { layout }),
        options.projectRoot,
      ),
      options.analyzerName,
    ),
  );
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
    `${JSON.stringify({ ...config, reporters: ['json'], output: outputDirectory })}\n`,
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
    return normalizeDuplicates(report, options.analyzerName, config.path);
  } finally {
    unlinkSync(configPath);
  }
}

function runDeadCode(options) {
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-knip.json');
  trackTemporaryPath(configPath);
  writeFileSync(
    configPath,
    `${JSON.stringify(
      layoutKnipConfig(
        parseReportJson(
          readFileSync(
            path.join(options.policyRoot, 'languages/typescript/preset/defaults/knip.json'),
            'utf8',
          ),
        ),
        readLayout(),
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
        'json',
        '--outputFile',
        testReportPath,
      ],
      acceptedStatuses: [0, 1],
    });
    if (result.status !== 0) {
      const report = readVitestReport(testReportPath);
      throw new Error(
        `coverage tests failed: ${formatVitestFailures(report)}${formatProcessOutput(result)}`,
      );
    }
    return readCoverageFindings(options, testReportPath);
  } finally {
    rmSync(testReportPath, { force: true });
    rmSync(configPath, { force: true });
  }
}

function readCoverageFindings(options, testReportPath) {
  const report = JSON.parse(
    readFileSync(
      path.join(options.projectRoot, 'reports/quality/coverage/coverage-final.json'),
      'utf8',
    ),
  );
  const testReport = JSON.parse(readFileSync(testReportPath, 'utf8'));
  return normalizeCoverage(
    withBranchSourceHashes(report, options.projectRoot),
    options.analyzerName,
    { projectRoot: options.projectRoot, testCount: testReport.numTotalTests },
  );
}

function readVitestReport(reportPath) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `could not read Vitest failure report: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export function formatVitestFailures(report) {
  const failedAssertions = [];
  const testResults = Array.isArray(report?.testResults) ? report.testResults : [];
  for (const testResult of testResults) {
    if (!Array.isArray(testResult?.assertionResults)) {
      continue;
    }
    const file = typeof testResult.name === 'string' ? testResult.name : '<unknown test file>';
    for (const assertion of testResult.assertionResults) {
      if (assertion?.status !== 'failed') {
        continue;
      }
      failedAssertions.push({
        file,
        name: vitestAssertionName(assertion),
        messages: Array.isArray(assertion.failureMessages)
          ? assertion.failureMessages.filter((message) => typeof message === 'string')
          : [],
      });
    }
  }
  const failedCount = Number.isInteger(report?.numFailedTests)
    ? report.numFailedTests
    : failedAssertions.length;
  if (failedAssertions.length === 0) {
    return `${String(failedCount)} tests failed; the report contained no failed assertion details`;
  }
  const details = failedAssertions.flatMap(({ file, name, messages }) => [
    `${file} > ${name}`,
    ...(messages.length > 0 ? messages : ['No assertion failure message was reported']),
  ]);
  return `${String(failedCount)} ${failedCount === 1 ? 'test' : 'tests'} failed:\n${details.join('\n')}`;
}

function vitestAssertionName(assertion) {
  if (typeof assertion.fullName === 'string') {
    return assertion.fullName;
  }
  if (typeof assertion.title === 'string') {
    return assertion.title;
  }
  return '<unknown test>';
}

function formatProcessOutput(result) {
  const output = [result.stderr, result.stdout]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .join('\n');
  return output.length > 0 ? `\nProcess output:\n${output}` : '';
}

function runCrap(options) {
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
  const sourceConfig = (
    await importPolicyModule(options, STRYKER_CONFIG_PATH, `?run=${Date.now().toString()}`)
  ).default;
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-stryker.config.mjs');
  const reportPath = 'reports/quality/mutation/mutation.json';
  const createdFiles = [];
  try {
    const tsconfigPath = installMutationCompanion(
      options,
      [sourceConfig.tsconfigFile, '.nitpicker-diff-tsconfig.stryker.json'],
      createdFiles,
    );
    const vitestConfigPath = installMutationCompanion(
      options,
      [sourceConfig.vitest?.configFile, '.nitpicker-diff-stryker.vitest.config.ts'],
      createdFiles,
    );
    const config = {
      ...rebaseMutationConfig(sourceConfig, {
        tsconfigFile: relativeProjectPath(options.projectRoot, tsconfigPath),
        vitestConfigFile: relativeProjectPath(options.projectRoot, vitestConfigPath),
      }),
      reporters: ['json'],
      jsonReporter: { fileName: reportPath },
    };
    writeTemporaryFile(
      configPath,
      `export default ${JSON.stringify(config, null, 2)};\n`,
      createdFiles,
    );
    runNodeTool({
      options,
      relativeToolPath: '@stryker-mutator/core/bin/stryker.js',
      arguments_: ['run', configPath],
      acceptedStatuses: [0],
    });
    const report = JSON.parse(readFileSync(path.join(options.projectRoot, reportPath), 'utf8'));
    return normalizeMutation(
      withMutationSourceHashes(report, options.projectRoot),
      options.analyzerName,
    );
  } finally {
    for (const filePath of createdFiles.reverse()) {
      rmSync(filePath, { force: true });
    }
  }
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
  );
}

export function normalizeDuplicates(report, analyzerName, configuredPaths = [sourceRoot]) {
  return evaluateDuplicates(jscpdClones(report, configuredPaths), analyzerName);
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
      message: `Unused file: ${filePath}`,
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
          message: `${category}: ${name}`,
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
          line: entry.lines?.start,
          crap: entry.crap,
        },
      ],
      { tool: analyzerName, limit: scoreLimit },
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
    label: mutant.mutatorName ?? 'mutant',
    line: mutant.location?.start?.line,
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
      return [absolutePath, { ...coverage, branchSourceHashes }];
    }),
  );
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
  return { ...entry, sourceHash: hash(lines[line - 1].trim()) };
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

function sourceLineRange(source, startLine, endLine) {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || endLine < startLine) {
    return '';
  }
  return source
    .split(/\r?\n/)
    .slice(startLine - 1, endLine)
    .join('\n');
}

async function runDependencyCruiser(options, sourcePaths, layout) {
  const { withProjectTypeScriptConfig } = await importPolicyModule(
    options,
    'languages/typescript/preset/dependency-graph/cruise.mjs',
  );
  const result = withProjectTypeScriptConfig(
    {
      policyRoot: options.policyRoot,
      projectRoot: options.projectRoot,
      name: options.kind,
    },
    (environment) =>
      runNodeTool({
        options,
        relativeToolPath: 'dependency-cruiser/bin/dependency-cruise.mjs',
        arguments_: [
          ...sourcePaths,
          '--config',
          path.join(options.policyRoot, 'languages/typescript/preset/dependency-graph/config.mjs'),
          '--exclude',
          [DEPENDENCY_GRAPH_EXCLUSION, layout.excludePattern]
            .filter((pattern) => pattern !== undefined)
            .join('|'),
          '--output-type',
          'json',
        ],
        environment,
        acceptedStatuses: [0],
      }),
  );
  const report = parseReportJson(result.stdout);
  if (!Array.isArray(report.modules)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return report;
}

function runNodeTool({
  options,
  relativeToolPath,
  absoluteToolPath,
  arguments_,
  cwd = options.projectRoot,
  environment = {},
  acceptedStatuses,
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
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${options.kind} exited with ${String(result.status)}: ${detail}`);
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

function installMutationCompanion(options, [sourceRelativePath, targetName], createdFiles) {
  const sourcePath = policyFile(
    options.policyRoot,
    companionPath(path.posix.dirname(STRYKER_CONFIG_PATH), sourceRelativePath),
  );
  const targetPath = path.join(options.projectRoot, targetName);
  const transform = layoutTransformFor(sourceRelativePath ?? '', readLayout());
  const text = readFileSync(sourcePath, 'utf8');
  writeTemporaryFile(
    targetPath,
    transform === undefined ? text : transform(text, targetPath),
    createdFiles,
  );
  return targetPath;
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

function parseArguments(arguments_) {
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
    segments[1] !== 'base'
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
