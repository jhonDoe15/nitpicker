import path from 'node:path';
import { RULE_IDS } from '../../../shared/policy.mjs';
import { sourceRoots as defaultSourceRoots } from '../preset/layout.mjs';

const ANALYZER_NAME = 'entry-points';
const PUBLIC_ALTERNATIVE_BYPASS = RULE_IDS.publicAlternativeBypass;
const runnerPath = path.join(import.meta.dirname, 'entry-points-runner.mjs');

export function createEntryPointAnalyzer({
  version,
  configurationHash,
  exclusions,
  sourceRoot,
  sourceRoots = sourceRoot === undefined ? defaultSourceRoots : [sourceRoot],
  shardWeight = 1,
}) {
  return {
    name: ANALYZER_NAME,
    version,
    configurationHash,
    exclusions,
    shardWeight,
    createInvocation({ projectRoot, policyRoot, toolRoot }) {
      return {
        command: process.execPath,
        args: [
          runnerPath,
          '--project-root',
          projectRoot,
          '--policy-root',
          policyRoot,
          '--tool-root',
          toolRoot,
          ...sourceRoots.flatMap((sourceRoot) => ['--source-root', sourceRoot]),
        ],
        cwd: toolRoot,
      };
    },
  };
}

export function toEntryPointDiffFindings(report) {
  return report.publicAlternativeBypasses.map((bypass) => ({
    tool: ANALYZER_NAME,
    rule: PUBLIC_ALTERNATIVE_BYPASS,
    path: bypass.source,
    identity: `target:${bypass.target}`,
    message: `Import ${bypass.target} through ${bypass.publicEntryPoint} (${bypass.dependencyKind})`,
    classification: 'enforceable',
  }));
}
