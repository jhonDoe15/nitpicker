import { fileURLToPath } from 'node:url';
import { PACKAGE_ROOT } from '../../../../../tooling/tool-resolution.mjs';
import type { AnalyzerRequest } from '../../../../execution/run-analyzers.mts';

export function analyzerRequest(analyzers: readonly unknown[]): AnalyzerRequest {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  return {
    analyzers,
    projectRoot: root,
    policyRoot: root,
    toolRoot: root,
    liveProjectRoot: PACKAGE_ROOT,
    snapshot: 'head',
    baselineRoot: undefined,
    baselineMovesFile: undefined,
    headPolicyFile: undefined,
    mutationScope: undefined,
    logRoot: undefined,
    runTasks: undefined,
  };
}
