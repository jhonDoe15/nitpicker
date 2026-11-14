import type { Finding } from '../../static-checks/shared.mts';
import type { AreaReport, QualityAreaOptions } from '../typed/area-types.mts';
import { parseReportJson, policyExport, runDependencyCruiser } from '../typed/tooling.mts';
import {
  normalizeBaselineExpansions,
  normalizeCoupling,
  normalizeTestRuntime,
  normalizeStructure,
} from '../reporting/repository.mts';
import { normalizeDeadCode, withDeadCodeSourceHashes } from '../reporting/dead-code.mts';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { containedPath } from '../../../../../core/fix/common/contained-path.mjs';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { existingRoots } from '../../typed/static-checks.mts';
import { type Layout, readHeadPolicy, readLayout } from '../../typed/head-policy.mts';
import type { KnipConfig } from '../typed/policy.mts';
import { withFunctionSourceHashes } from '../reporting/source-hashes.mts';
import {
  baselinePathsOf,
  hash,
  layoutKnipConfig,
  moduleImportsSection,
  projectImports,
  typescriptStructureProjectFindings,
} from '../typed/repository.mts';
import { spawnedEntryFiles } from '../../dependency-graph/spawned-entries.mts';
import { runDesignSignals } from './program/design-signals.mts';
import { runTestOnlyExports, runUnusedApi } from './unused-api.mts';
import { knipReport, withProjectKnipConfig } from '../knip/knip-run.mts';

const CODING_STANDARDS = 'languages/typescript/preset/coding-standards/check.mjs';
const TEST_RUNTIME = 'languages/typescript/preset/test-runtime/analyze.mjs';

type AnalyzeRoot = (root: string) => Finding[] | Promise<Finding[]>;

export async function runCodingStandards(options: QualityAreaOptions): Promise<Finding[]> {
  const collectSignals = await policyExport(options, CODING_STANDARDS, 'collectSignals');
  const collectArchitectureSignals = await policyExport(
    options,
    CODING_STANDARDS,
    'collectArchitectureSignals',
  );
  const compareSignals = await policyExport(options, CODING_STANDARDS, 'compareSignals');
  const baselineRelativePath = options.legacyInventory;
  const baseline = readOptionalBaseline(options.projectPolicyRoot, baselineRelativePath);
  const signals = [
    ...listOf(await collectSignals(options.projectRoot, options.policyRoot)),
    ...listOf(collectArchitectureSignals(options.projectRoot)),
  ];
  const findings = listOf(compareSignals(signals, baseline)).map((signal) => ({
    tool: options.analyzerName,
    rule: textOf(fieldOf(signal, 'rule')),
    path: textOf(fieldOf(signal, 'file')),
    identity: `source:${hash(fieldOf(signal, 'source'))}|count:${textOf(fieldOf(signal, 'count'))}`,
    message: signalMessage(signal),
    classification: 'enforceable',
  }));
  if (options.snapshot === 'head' && options.baselineRoot !== undefined) {
    const baseBaseline = readOptionalBaseline(options.baselineRoot, baselineRelativePath);
    findings.push(...normalizeBaselineExpansions(baseBaseline, baseline, options.analyzerName));
  }
  return findings;
}

function signalMessage(signal: unknown): string {
  const message = fieldOf(signal, 'message');
  return message === undefined || message === null
    ? `New coding-standard site: ${textOf(fieldOf(signal, 'source'))}`
    : textOf(message);
}

function readOptionalBaseline(root: string, relativePath: string): unknown[] {
  const baselinePath = containedPath(root, relativePath);
  if (!existsSync(baselinePath)) {
    return [];
  }
  return [...listOf(fieldOf(parseReportJson(readFileSync(baselinePath, 'utf8')), 'sites'))];
}

async function perSourceRoot(
  options: QualityAreaOptions,
  layout: Layout,
  analyze: AnalyzeRoot,
): Promise<Finding[]> {
  const roots = existingRoots(options.projectRoot, layout.sourceRoots);
  const groups = await Promise.all(
    roots.map(async (root) => prefixAggregates(root, roots.length, await analyze(root))),
  );
  return groups.flat();
}

function prefixAggregates(root: string, rootCount: number, findings: Finding[]): Finding[] {
  return rootCount === 1
    ? findings
    : findings.map((finding) =>
        finding.path === '.' ? { ...finding, identity: `${root}|${finding.identity}` } : finding,
      );
}

export async function runCoupling(options: QualityAreaOptions): Promise<AreaReport> {
  const layout = readLayout();
  const graph = runDependencyCruiser(options, layout);
  const analyzeCoupling = await policyExport(
    options,
    'languages/typescript/preset/coupling/analyze.mjs',
    'analyzeCoupling',
  );
  const { exceptions, history } = readHeadPolicy();
  const findings = await perSourceRoot(options, layout, (root) =>
    normalizeCoupling(
      analyzeCoupling(graph, root, { layout, projectRoot: options.projectRoot }),
      options.analyzerName,
      exceptions,
    ),
  );
  return { findings, ...moduleImportsSection(projectImports(graph, layout.isSourceFile), history) };
}

export async function runTestRuntime(options: QualityAreaOptions): Promise<Finding[]> {
  const layout = readLayout();
  const graph = runDependencyCruiser(options, layout);
  const loadModuleSources = await policyExport(options, TEST_RUNTIME, 'loadModuleSources');
  const analyzeTestRuntime = await policyExport(options, TEST_RUNTIME, 'analyzeTestRuntime');
  const sourceTexts: unknown = await loadModuleSources(graph, options.projectRoot, layout);
  const report = analyzeTestRuntime(graph, {
    layout,
    productionRoots: layout.sourceRoots,
    sourceTexts,
  });
  return normalizeTestRuntime(
    {
      ...fieldsOf(report),
      findings: listOf(fieldOf(report, 'findings')).map((finding) => ({
        ...fieldsOf(finding),
        sourceHash: hash(sourceTextOf(sourceTexts, fieldOf(finding, 'test'))),
      })),
    },
    options.analyzerName,
  );
}

function sourceTextOf(sourceTexts: unknown, file: unknown): unknown {
  return sourceTexts instanceof Map ? (sourceTexts.get(file) ?? '') : '';
}

export async function runStructure(options: QualityAreaOptions): Promise<Finding[]> {
  const analyzeProductionFiles = await policyExport(
    options,
    'languages/typescript/preset/structure/analyze.mjs',
    'analyzeProductionFiles',
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
    ...(await runDesignSignals(options)),
  ];
}

function withSpawnedEntries(config: KnipConfig, projectRoot: string): KnipConfig {
  return {
    ...config,
    entry: [...listOf(fieldOf(config, 'entry')), ...spawnedEntryFiles(projectRoot)],
  };
}

export function runDeadCode(options: QualityAreaOptions): Finding[] {
  const config = withProjectKnipConfig(
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
      knip: (productionConfig: KnipConfig) => knipReport(options, productionConfig),
    }),
  ];
}
