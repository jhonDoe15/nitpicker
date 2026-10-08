import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
import { DEFAULT_LEGACY_INVENTORY } from '../../preset/coding-standards/inventory-path.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT, parsePositiveNumber } from '../../preset/quality-checks.mjs';
import {
  sourceRoot,
  graphRoots,
  existingRoots,
  projectCodeFiles,
  isSourceFile,
  isRunnableTestFile,
} from '../../preset/layout.mjs';
import { PACKAGE_ROOT, resolveTool, toolNameForPath } from '../tool-resolution.mjs';

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
const STRUCTURAL_METADATA_FIELDS = new Set(['source', 'sourceHash', 'start', 'end']);
const DEPENDENCY_GRAPH_EXCLUSION =
  '(^|/)(node_modules|dist|build|generated|coverage|reports|target)(/|$)';
const MINIMUM_BRANCH_COVERAGE = 95;
const STRYKER_CONFIG_PATH = 'preset/defaults/stryker.config.mjs';
const FUNCTION_STRUCTURE_LIMITS = {
  lines: 50,
  statements: 15,
  maxControlNesting: 2,
  parameters: 3,
};
const ENFORCED_DEAD_CODE_CATEGORIES = new Set(['files', 'exports', 'types']);
const ENFORCED_MUTATION_STATUSES = new Set(['Survived', 'NoCoverage']);

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
    const files = projectCodeFiles(options.projectRoot);
    if (files.length === 0) return [];
    if (
      ['coupling', 'structure', 'crap', 'mutation'].includes(options.kind) &&
      !files.some(isSourceFile)
    )
      return [];
    if (
      ['test-runtime', 'coverage', 'mutation'].includes(options.kind) &&
      !files.some(isRunnableTestFile)
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
  const checker = await importPolicyModule(options, 'preset/coding-standards/check.mjs');
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

async function runCoupling(options) {
  const graph = await runDependencyCruiser(
    options,
    existingRoots(options.projectRoot, [sourceRoot]),
  );
  const { analyzeCoupling } = await importPolicyModule(options, 'preset/coupling/analyze.mjs');
  return normalizeCoupling(analyzeCoupling(graph, sourceRoot), options.analyzerName);
}

async function runTestRuntime(options) {
  const graph = await runDependencyCruiser(options, existingRoots(options.projectRoot, graphRoots));
  const analyzer = await importPolicyModule(options, 'preset/test-runtime/analyze.mjs');
  const sourceTexts = await analyzer.loadModuleSources(graph, options.projectRoot);
  const report = analyzer.analyzeTestRuntime(graph, {
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
    'preset/structure/analyze.mjs',
  );
  const report = analyzeProductionFiles(path.join(options.projectRoot, sourceRoot), sourceRoot);
  return normalizeStructure(
    withFunctionSourceHashes(report, options.projectRoot),
    options.analyzerName,
  );
}

function runDuplicates(options) {
  const configPath = path.join(options.projectRoot, '.quality-diff-jscpd.json');
  const outputDirectory = path.join(options.projectRoot, 'reports/quality/duplicates');
  const config = parseReportJson(
    readFileSync(path.join(options.policyRoot, 'preset/defaults/jscpd.json'), 'utf8'),
  );
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
  const configPath = path.join(options.projectRoot, '.quality-diff-knip.json');
  writeFileSync(
    configPath,
    readFileSync(path.join(options.policyRoot, 'preset/defaults/knip.json'), 'utf8'),
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
  const configPath = path.join(options.projectRoot, '.quality-diff-vitest.config.ts');
  const testReportPath = path.join(options.projectRoot, '.quality-diff-vitest-report.json');
  if (existsSync(testReportPath)) {
    throw new Error(`Temporary coverage report already exists: ${testReportPath}`);
  }
  writeFileSync(
    configPath,
    readFileSync(path.join(options.policyRoot, 'preset/defaults/vitest.quality.config.ts'), 'utf8'),
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
      options.projectRoot,
      { testCount: testReport.numTotalTests },
    );
  } finally {
    rmSync(testReportPath, { force: true });
    rmSync(configPath, { force: true });
  }
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
    absoluteToolPath: path.join(options.policyRoot, 'preset/crap/report.mjs'),
    arguments_: [],
    cwd: options.projectRoot,
    environment: { QUALITY_PROJECT_ROOT: options.projectRoot },
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
  const configPath = path.join(options.projectRoot, '.quality-diff-stryker.config.mjs');
  const reportPath = 'reports/quality/mutation/mutation.json';
  const createdFiles = [];
  try {
    const tsconfigPath = installMutationCompanion(
      options,
      sourceConfig.tsconfigFile,
      '.quality-diff-tsconfig.stryker.json',
      createdFiles,
    );
    const vitestConfigPath = installMutationCompanion(
      options,
      sourceConfig.vitest?.configFile,
      '.quality-diff-stryker.vitest.config.ts',
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
  const baseCounts = new Map(
    baseSites.map((site) => [baselineSiteKey(site), numericAllowance(site.count)]),
  );
  return headSites.flatMap((site) => {
    const key = baselineSiteKey(site);
    const baseCount = baseCounts.get(key) ?? 0;
    const headCount = numericAllowance(site.count);
    if (headCount <= baseCount) {
      return [];
    }
    return [
      {
        tool: analyzerName,
        rule: 'baseline-expansion',
        path: site.file,
        identity: `site:${hash(key)}`,
        message: `Legacy allowance increased from ${String(baseCount)} to ${String(headCount)} for ${site.rule}`,
        classification: 'enforceable',
      },
    ];
  });
}

export function normalizeCoupling(report, analyzerName) {
  const findings = summaryMetrics(analyzerName, report.summary, 'coupling');
  for (const module of report.modules ?? []) {
    for (const metricName of [
      'fanIn',
      'fanOut',
      'totalCoupling',
      'instability',
      'runtimeFanIn',
      'runtimeFanOut',
      'runtimeInstability',
    ]) {
      addMetric(findings, {
        analyzerName,
        rule: 'module-coupling',
        path: module.source,
        identity: `module:${metricName}`,
        message: `${metricName} for ${module.source}`,
        metricName,
        value: module[metricName],
      });
    }
  }
  for (const packageMetric of report.packages ?? []) {
    const values = {
      modules: packageMetric.modules,
      fanIn: packageMetric.fanIn,
      fanOut: packageMetric.fanOut,
      instability: packageMetric.instability,
      internalEdges: packageMetric.cohesion?.internalEdges,
      edgeDensity: packageMetric.cohesion?.edgeDensity,
      connectedComponents: packageMetric.cohesion?.connectedComponents,
      largestComponentShare: packageMetric.cohesion?.largestComponentShare,
    };
    for (const [metricName, value] of Object.entries(values)) {
      addMetric(findings, {
        analyzerName,
        rule: 'package-coupling',
        path: '.',
        identity: `package:${packageMetric.name}:${metricName}`,
        message: `${metricName} for package ${packageMetric.name}`,
        metricName,
        value,
      });
    }
  }
  for (const direction of report.stabilityDirection ?? []) {
    findings.push({
      tool: analyzerName,
      rule: 'stability-direction',
      path: '.',
      identity: `package-edge:${direction.source}->${direction.target}`,
      message: `${direction.source} depends on less stable package ${direction.target}`,
      classification: 'enforceable',
    });
    addMetric(findings, {
      analyzerName,
      rule: 'stability-direction-metric',
      path: '.',
      identity: `package-edge:${direction.source}->${direction.target}`,
      message: `${direction.source} depends on less stable package ${direction.target}`,
      metricName: 'instabilityDelta',
      value: direction.delta,
    });
  }
  return findings;
}

export function normalizeTestRuntime(report, analyzerName) {
  const findings = summaryMetrics(analyzerName, report.summary, 'test-runtime', ['categories']);
  for (const [category, value] of Object.entries(report.summary?.categories ?? {})) {
    addMetric(findings, {
      analyzerName,
      rule: 'category-count',
      path: '.',
      identity: `category:${category}`,
      message: `Tests classified as ${category}`,
      metricName: category,
      value,
    });
  }
  for (const finding of report.findings ?? []) {
    findings.push({
      tool: analyzerName,
      rule: finding.category,
      path: finding.test,
      identity: `test:${finding.test}:source:${finding.sourceHash ?? hash(finding.test)}`,
      message: `Test has ${finding.category.replaceAll('-', ' ')}`,
      classification: 'enforceable',
    });
  }
  return findings;
}

export function normalizeStructure(report, analyzerName) {
  const findings = summaryMetrics(analyzerName, report.summary, 'structure');
  for (const [kind, values] of Object.entries(report.distributions ?? {})) {
    for (const [percentile, value] of Object.entries(values ?? {})) {
      addMetric(findings, {
        analyzerName,
        rule: 'distribution',
        path: '.',
        identity: `${kind}:${percentile}`,
        message: `${percentile} ${kind}`,
        metricName: `${kind}.${percentile}`,
        value,
      });
    }
  }
  addStructuralEntries(findings, analyzerName, report.functions, 'function');
  addStructuralEntries(findings, analyzerName, report.classes, 'class');
  return findings;
}

function addStructuralEntries(findings, analyzerName, entries = [], kind) {
  const occurrences = new Map();
  for (const entry of entries) {
    const displayName = entry[kind];
    const occurrenceKey = `${entry.source}\0${displayName}`;
    const occurrence = nextOccurrence(occurrences, occurrenceKey);
    if (kind === 'function') {
      addFunctionStructureViolations(findings, analyzerName, entry, displayName, occurrence);
    }
    for (const [metricName, value] of Object.entries(entry)) {
      if (metricName === kind || STRUCTURAL_METADATA_FIELDS.has(metricName)) {
        continue;
      }
      addMetric(findings, {
        analyzerName,
        rule: `${kind}-structure`,
        path: entry.source,
        identity: `${kind}:${displayName}:occurrence:${String(occurrence)}:${metricName}`,
        message: `${metricName} for ${displayName}`,
        metricName,
        value,
        symbol: displayName,
        line: entry.start,
      });
    }
  }
}

function addFunctionStructureViolations(findings, analyzerName, entry, displayName, occurrence) {
  const sourceHash =
    entry.sourceHash ?? hash(`${entry.source}:${String(entry.start)}:${String(entry.end)}`);
  for (const [metricName, limit] of Object.entries(FUNCTION_STRUCTURE_LIMITS)) {
    if (typeof entry[metricName] !== 'number' || entry[metricName] <= limit) {
      continue;
    }
    const ruleMetric =
      metricName === 'maxControlNesting' ? 'control-nesting' : metricName.toLowerCase();
    findings.push({
      tool: analyzerName,
      rule: `function-${ruleMetric}-limit`,
      path: entry.source,
      identity: `function:${displayName}:occurrence:${String(occurrence)}:source:${sourceHash}`,
      message: `${displayName} has ${String(entry[metricName])} ${metricName}; limit is ${String(limit)}`,
      classification: 'enforceable',
      symbol: displayName,
      ...(positiveInteger(entry.start) === undefined ? {} : { location: { line: entry.start } }),
    });
  }
}

export function normalizeDuplicates(report, analyzerName, configuredPaths = [sourceRoot]) {
  const findings = [];
  const prefix =
    Array.isArray(configuredPaths) && configuredPaths.length === 1
      ? configuredPaths[0].replace(/\/$/, '')
      : '';
  const occurrences = new Map();
  for (const duplicate of report.duplicates ?? []) {
    const files = [
      {
        path: prefixedPath(prefix, duplicate.firstFile?.name),
        line: duplicate.firstFile?.start,
      },
      {
        path: prefixedPath(prefix, duplicate.secondFile?.name),
        line: duplicate.secondFile?.start,
      },
    ].sort((left, right) => left.path.localeCompare(right.path));
    const pairKey = files.map((file) => file.path).join('\0');
    const occurrence = nextOccurrence(occurrences, pairKey);
    findings.push({
      tool: analyzerName,
      rule: 'duplicate-clone',
      path: files[0].path,
      identity: `pair:${files.map((file) => file.path).join('|')}:fragment:${hash(duplicate.fragment ?? '')}:occurrence:${String(occurrence)}`,
      message: `Duplicate with ${files[1].path}`,
      classification: 'enforceable',
      ...(positiveInteger(files[0].line) === undefined
        ? {}
        : { location: { line: files[0].line } }),
    });
    for (const metricName of ['lines', 'tokens']) {
      addMetric(findings, {
        analyzerName,
        rule: 'duplicate-clone-size',
        path: files[0].path,
        identity: `pair:${files.map((file) => file.path).join('|')}:occurrence:${String(occurrence)}:${metricName}`,
        message: `Duplicate with ${files[1].path}`,
        metricName,
        value: duplicate[metricName],
        line: files[0].line,
      });
    }
  }
  return findings;
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
              ? `|source:${issue.sourceHash ?? hash(issue.file)}`
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

export function normalizeCoverage(report, analyzerName, projectRoot, { testCount } = {}) {
  const findings = [];
  let coveredBranchOutcomes = 0;
  for (const [absolutePath, coverage] of Object.entries(report)) {
    const relativePath = path.relative(projectRoot, absolutePath).replaceAll('\\', '/');
    const branchEntries = Object.entries(coverage.b ?? {});
    const branchOutcomes = branchEntries.flatMap(([, outcomes]) => outcomes);
    coveredBranchOutcomes += branchOutcomes.filter((value) => value > 0).length;
    addMetric(findings, {
      analyzerName,
      rule: 'coverage',
      path: relativePath,
      identity: 'branches',
      message: `Branch coverage for ${relativePath}`,
      metricName: 'branches',
      value: coveragePercent(branchOutcomes),
    });
    const occurrences = new Map();
    for (const [branchId, outcomes] of branchEntries) {
      const branchCoverage = coveragePercent(outcomes);
      if (branchCoverage >= MINIMUM_BRANCH_COVERAGE) {
        continue;
      }
      const branchSourceHash =
        coverage.branchSourceHashes?.[branchId] ??
        hash(JSON.stringify(coverage.branchMap?.[branchId] ?? { branchId }));
      const occurrence = nextOccurrence(occurrences, branchSourceHash);
      const line = positiveInteger(coverage.branchMap?.[branchId]?.loc?.start?.line);
      findings.push({
        tool: analyzerName,
        rule: 'changed-branch-coverage',
        path: relativePath,
        identity: `branch-source:${branchSourceHash}:occurrence:${String(occurrence)}`,
        message: `Branch coverage is ${branchCoverage.toFixed(2)}%; minimum is ${String(MINIMUM_BRANCH_COVERAGE)}%`,
        classification: 'enforceable',
        ...(line === undefined ? {} : { location: { line } }),
      });
    }
  }
  if (Number.isInteger(testCount) && testCount > 0) {
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
  return findings;
}

export function normalizeCrap(
  report,
  analyzerName,
  { scoreLimit = DEFAULT_CRAP_SCORE_LIMIT } = {},
) {
  const findings = summaryMetrics(analyzerName, report.summary, 'crap');
  const occurrences = new Map();
  const functions = [...(report.functions ?? [])].sort(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      (left.lines?.start ?? 0) - (right.lines?.start ?? 0) ||
      (left.lines?.end ?? 0) - (right.lines?.end ?? 0) ||
      left.function.localeCompare(right.function),
  );
  for (const entry of functions) {
    const key = `${entry.source}\0${entry.function}`;
    const occurrence = nextOccurrence(occurrences, key);
    const sourceHash =
      entry.sourceHash ??
      hash(`${entry.source}:${String(entry.lines?.start)}:${String(entry.lines?.end)}`);
    const violationIdentity = `function:${entry.function}:occurrence:${String(occurrence)}:source:${sourceHash}`;
    if (typeof entry.crap !== 'number' || !Number.isFinite(entry.crap)) {
      findings.push({
        tool: analyzerName,
        rule: 'crap-coverage-unknown',
        path: entry.source,
        identity: violationIdentity,
        message: `${entry.function} has unknown coverage and no CRAP score`,
        classification: 'enforceable',
        symbol: entry.function,
        ...(positiveInteger(entry.lines?.start) === undefined
          ? {}
          : { location: { line: entry.lines.start } }),
      });
    } else if (entry.crap >= scoreLimit) {
      findings.push({
        tool: analyzerName,
        rule: 'crap-score-limit',
        path: entry.source,
        identity: violationIdentity,
        message: `${entry.function} has CRAP ${entry.crap.toFixed(2)}; score must be below ${String(scoreLimit)}`,
        classification: 'enforceable',
        symbol: entry.function,
        ...(positiveInteger(entry.lines?.start) === undefined
          ? {}
          : { location: { line: entry.lines.start } }),
      });
    }
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
  return findings;
}

export function normalizeMutation(report, analyzerName) {
  const findings = [];
  const statusCounts = new Map();
  const occurrences = new Map();
  for (const [filePath, file] of Object.entries(report.files ?? {})) {
    for (const mutant of file.mutants ?? []) {
      const status = mutant.status ?? 'Unknown';
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
      if (status === 'Killed') {
        continue;
      }
      const line = mutant.location?.start?.line;
      const semanticIdentity = [
        mutant.mutatorName ?? 'unknown',
        hash(mutant.replacement ?? ''),
        mutant.sourceHash ?? hash(filePath),
      ].join('|');
      const occurrence = nextOccurrence(occurrences, `${filePath}\0${status}\0${semanticIdentity}`);
      findings.push({
        tool: analyzerName,
        rule: `mutant-${status.toLowerCase()}`,
        path: filePath,
        identity: `${semanticIdentity}|occurrence:${String(occurrence)}`,
        message: `${status} ${mutant.mutatorName ?? 'mutant'}`,
        classification: ENFORCED_MUTATION_STATUSES.has(status) ? 'enforceable' : 'descriptive',
        ...(positiveInteger(line) === undefined ? {} : { location: { line } }),
      });
    }
  }
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

function summaryMetrics(analyzerName, summary = {}, rule, ignored = []) {
  const findings = [];
  for (const [metricName, value] of Object.entries(summary)) {
    if (ignored.includes(metricName)) {
      continue;
    }
    addMetric(findings, {
      analyzerName,
      rule,
      path: '.',
      identity: `summary:${metricName}`,
      message: `${metricName} summary`,
      metricName,
      value,
    });
  }
  return findings;
}

function addMetric(
  findings,
  { analyzerName, rule, path: findingPath, identity, message, metricName, value, symbol, line },
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return;
  }
  findings.push({
    tool: analyzerName,
    rule,
    path: findingPath,
    identity,
    message,
    classification: 'descriptive',
    metric: { name: metricName, value },
    ...(typeof symbol === 'string' && symbol.length > 0 ? { symbol } : {}),
    ...(positiveInteger(line) === undefined ? {} : { location: { line } }),
  });
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
    issues: (report.issues ?? []).map((issue) => ({
      ...issue,
      sourceHash: hash(readProjectSource(projectRoot, issue.file)),
    })),
  };
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

async function runDependencyCruiser(options, sourcePaths) {
  const { withProjectTypeScriptConfig } = await importPolicyModule(
    options,
    'preset/dependency-graph/cruise.mjs',
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
          path.join(options.policyRoot, 'preset/dependency-graph/config.mjs'),
          '--exclude',
          DEPENDENCY_GRAPH_EXCLUSION,
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

function installMutationCompanion(options, sourceRelativePath, targetName, createdFiles) {
  const sourcePath = policyFile(
    options.policyRoot,
    companionPath(path.posix.dirname(STRYKER_CONFIG_PATH), sourceRelativePath),
  );
  const targetPath = path.join(options.projectRoot, targetName);
  writeTemporaryFile(targetPath, readFileSync(sourcePath, 'utf8'), createdFiles);
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

function prefixedPath(prefix, value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Duplicate report contains an invalid file name');
  }
  const normalizedValue = value.replaceAll('\\', '/').replace(/^\.\//, '');
  return prefix.length === 0 ||
    normalizedValue === prefix ||
    normalizedValue.startsWith(`${prefix}/`)
    ? normalizedValue
    : `${prefix}/${normalizedValue}`;
}

function parseReportJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Invalid quality area JSON report', { cause: error });
  }
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function nextOccurrence(occurrences, key) {
  const occurrence = (occurrences.get(key) ?? 0) + 1;
  occurrences.set(key, occurrence);
  return occurrence;
}

function baselineSiteKey(site) {
  if (
    typeof site?.file !== 'string' ||
    typeof site.rule !== 'string' ||
    typeof site.source !== 'string'
  ) {
    throw new TypeError('Coding-standard baseline contains an invalid site');
  }
  return JSON.stringify([site.file, site.rule, site.source]);
}

function numericAllowance(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError('Coding-standard baseline counts must be positive integers');
  }
  return value;
}

function requiredValue(values, name) {
  const value = values.get(name);
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}
