import path from 'node:path';
import { linkPolicyFile } from '../../../../../core/tooling/policy-links.mjs';
import { exceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { readHeadPolicy, readLayout } from '../../../preset/head-policy.mjs';
import { layoutTransformFor } from '../../../preset/tool-configs.mjs';
import {
  layoutKnipProductionConfig,
  withEntryExports,
} from '../../../preset/unused-api/test-only/production-config.mjs';
import {
  needsProductionRun,
  testOnlyExportFindings,
} from '../../../preset/unused-api/test-only/test-only-exports.mjs';
import { loadPackages } from '../../../preset/unused-api/workspace/packages.mjs';
import { toolErrorFinding } from '../reporting/vitest.mjs';
import { importPolicyModule, policyFile } from './tooling.mjs';

const TYPESCRIPT_CONFIG = 'languages/typescript/preset/defaults/tsconfig.quality.json';
const ANALYZER = 'languages/typescript/preset/unused-api/analyze.mjs';

function failure(options, rule, error) {
  const message = error instanceof Error ? error.message : String(error);
  return [toolErrorFinding(options, { rule, message: `${rule} could not run: ${message}` })];
}

function analyze(options, { analyzeUnusedApi }) {
  const installed = linkPolicyFile(
    policyFile(options.policyRoot, TYPESCRIPT_CONFIG),
    path.join(options.projectRoot, '.nitpicker-diff-unused-api-tsconfig.json'),
    layoutTransformFor(TYPESCRIPT_CONFIG, readLayout()),
  );
  try {
    return analyzeUnusedApi({
      projectRoot: options.projectRoot,
      configPath: installed.targetPath,
      analyzerName: options.analyzerName,
    });
  } finally {
    installed.remove();
  }
}

/** Unused props and options; a failure is a tool error, so the other structure checks still report. */
export async function runUnusedApi(options) {
  try {
    return analyze(options, await importPolicyModule(options, ANALYZER));
  } catch (error) {
    return failure(options, 'unused-api', error);
  }
}

function testOnlyFindings(options, { config, normal, knip }) {
  const layout = readLayout();
  const packagesInfo = loadPackages(options.projectRoot, layout);
  const hasTests = layout.projectCodeFiles(options.projectRoot).some(layout.isTestFile);
  if (!hasTests || !needsProductionRun(packagesInfo, options.projectRoot)) return [];
  const productionConfig = layoutKnipProductionConfig(config, layout);
  return testOnlyExportFindings({
    normal,
    production: knip(productionConfig),
    entryExportRuns: {
      production: () => knip(withEntryExports(productionConfig)),
      normal: () => knip(withEntryExports(config)),
    },
    packagesInfo,
    context: {
      layout,
      projectRoot: options.projectRoot,
      analyzerName: options.analyzerName,
      isExcepted: exceptionMatcher(readHeadPolicy().exceptions),
    },
  });
}

/** Test-only exports and modules; a failed knip run is a tool error next to the normal findings. */
export function runTestOnlyExports(options, runs) {
  try {
    return testOnlyFindings(options, runs);
  } catch (error) {
    return failure(options, 'test-only-export', error);
  }
}
