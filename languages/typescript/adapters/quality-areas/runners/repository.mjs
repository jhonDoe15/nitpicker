import {
  importPolicyModule,
  parseReportJson,
  runDependencyCruiser,
  runNodeTool,
} from './tooling.mjs';
import { hash } from '../../../../../shared/rules/finding-helpers.mjs';
import {
  normalizeBaselineExpansions,
  normalizeCoupling,
  normalizeTestRuntime,
  normalizeStructure,
} from '../reporting/repository.mjs';
import { normalizeDeadCode } from '../reporting/dead-code.mjs';
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, realpathSync, unlinkSync } from 'node:fs';
import { existingRoots } from '../../../preset/layout.mjs';
import { readHeadPolicy, readLayout } from '../../../preset/head-policy.mjs';
import { withFunctionSourceHashes, withDeadCodeSourceHashes } from '../reporting/source-hashes.mjs';
import { typescriptStructureProjectFindings } from '../../../preset/structure/project-findings.mjs';
import { layoutJscpdConfig, layoutKnipConfig } from '../../../preset/tool-configs.mjs';
import { trackTemporaryPath } from '../../../../../core/tooling/temporary-files.mjs';
import { normalizeDuplicates } from '../../../preset/duplicates/normalize.mjs';
import { runTestOnlyExports, runUnusedApi } from './unused-api.mjs';
import { spawnedEntryFiles } from '../../dependency-graph/spawned-entries.mjs';
import { baselinePathsOf } from '../base-paths.mjs';

export async function runCodingStandards(options) {
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
    message: signal.message ?? `New coding-standard site: ${signal.source}`,
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

export async function runCoupling(options) {
  const layout = readLayout();
  const graph = runDependencyCruiser(options, layout);
  const { analyzeCoupling } = await importPolicyModule(
    options,
    'languages/typescript/preset/coupling/analyze.mjs',
  );
  const { exceptions } = readHeadPolicy();
  return perSourceRoot(options, layout, (root) =>
    normalizeCoupling(
      analyzeCoupling(graph, root, { layout, projectRoot: options.projectRoot }),
      options.analyzerName,
      exceptions,
    ),
  );
}

export async function runTestRuntime(options) {
  const layout = readLayout();
  const graph = runDependencyCruiser(options, layout);
  const analyzer = await importPolicyModule(
    options,
    'languages/typescript/preset/test-runtime/analyze.mjs',
  );
  const sourceTexts = await analyzer.loadModuleSources(graph, options.projectRoot, layout);
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

export async function runStructure(options) {
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
    ...typescriptStructureProjectFindings({ ...options, baselinePaths: baselinePathsOf(options) }),
    ...(await runUnusedApi(options)),
  ];
}

export function runDuplicates(options) {
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

function knipReport(options, config) {
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-knip.json');
  trackTemporaryPath(configPath);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  try {
    const result = runNodeTool({
      options,
      relativeToolPath: 'knip/bin/knip.js',
      arguments_: ['--config', configPath, '--reporter', 'json'],
      acceptedStatuses: [0, 1],
    });
    return JSON.parse(result.stdout);
  } finally {
    unlinkSync(configPath);
  }
}

export function runDeadCode(options) {
  const config = withSpawnedEntries(
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
  );
  const normal = knipReport(options, config);
  return [
    ...normalizeDeadCode(
      withDeadCodeSourceHashes(normal, options.projectRoot),
      options.analyzerName,
      { exceptions: readHeadPolicy().exceptions },
    ),
    ...runTestOnlyExports(options, {
      config,
      normal,
      knip: (productionConfig) => knipReport(options, productionConfig),
    }),
  ];
}
