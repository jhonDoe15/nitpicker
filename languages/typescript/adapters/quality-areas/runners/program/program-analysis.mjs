import path from 'node:path';
import { linkPolicyFile } from '../../../../../../core/tooling/policy-links.mjs';
import { readLayout } from '../../../../preset/head-policy.mjs';
import { layoutTransformFor } from '../../../../preset/tool-configs.mjs';
import { toolErrorFinding } from '../../reporting/test-report.mjs';
import { importPolicyModule, policyFile } from '../tooling.mjs';

const TYPESCRIPT_CONFIG = 'languages/typescript/preset/defaults/tsconfig.quality.json';

export function failure(options, rule, error) {
  const message = error instanceof Error ? error.message : String(error);
  return [toolErrorFinding(options, { rule, message: `${rule} could not run: ${message}` })];
}

function analyze(options, { linkName, analyze: run }) {
  const installed = linkPolicyFile(
    policyFile(options.policyRoot, TYPESCRIPT_CONFIG),
    path.join(options.projectRoot, linkName),
    layoutTransformFor(TYPESCRIPT_CONFIG, readLayout()),
  );
  try {
    return run({
      projectRoot: options.projectRoot,
      configPath: installed.targetPath,
      analyzerName: options.analyzerName,
    });
  } finally {
    installed.remove();
  }
}

/**
 * Runs an analyzer over a type-checked program of the project, built from the policy tsconfig. A
 * failure is a tool error of `rule`, so the analyzer's other findings still report.
 */
export async function runProgramAnalysis(options, { rule, analyzer, linkName, exportName }) {
  try {
    const module = await importPolicyModule(options, analyzer);
    return analyze(options, { linkName, analyze: module[exportName] });
  } catch (error) {
    return failure(options, rule, error);
  }
}
