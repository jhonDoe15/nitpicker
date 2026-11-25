import path from 'node:path';
import type { Finding } from '../../../static-checks/shared.mts';
import type { QualityAreaOptions } from '../../typed/area-types.mts';
import { linkPolicyFile } from '../../../typed/tooling.mts';
import { layoutTransformFor, readLayout } from '../../../typed/head-policy.mts';
import { toolErrorFinding } from '../../reporting/test-report.mts';
import { collectGarbage } from './collect-garbage.mts';
import { type PolicyFunction, findingsOf, policyExport, policyFile } from '../../typed/tooling.mts';

const TYPESCRIPT_CONFIG = 'languages/typescript/preset/defaults/tsconfig.quality.json';

type ProgramAnalysis = {
  readonly rule: string;
  readonly analyzer: string;
  readonly linkName: string;
  readonly exportName: string;
};

export function failure(options: QualityAreaOptions, rule: string, error: unknown): Finding[] {
  const message = error instanceof Error ? error.message : String(error);
  return [
    toolErrorFinding(options, {
      rule,
      message: `${rule} could not run: ${message}`,
      anchor: undefined,
    }),
  ];
}

export function linkedAnalysis(
  options: QualityAreaOptions,
  { linkName, analyze: run }: { readonly linkName: string; readonly analyze: PolicyFunction },
): unknown {
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
      environment: options.environment,
    });
  } finally {
    installed.remove();
    collectGarbage();
  }
}

export async function runProgramAnalysis(
  options: QualityAreaOptions,
  { rule, analyzer, linkName, exportName }: ProgramAnalysis,
): Promise<Finding[]> {
  try {
    const run = await policyExport(options, analyzer, exportName);
    return findingsOf(linkedAnalysis(options, { linkName, analyze: run }));
  } catch (error) {
    return failure(options, rule, error);
  }
}
