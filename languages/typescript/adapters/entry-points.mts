import path from 'node:path';
import { RULE_IDS } from '../../../shared/policy.mts';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../shared/paths/checkout-module.mts';

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;
import { sourceRoots as defaultSourceRoots } from '../preset/layout.mts';
import type { Finding } from './static-checks/shared.mts';

type EntryPointSettings = {
  readonly version?: string | undefined;
  readonly configurationHash?: string | undefined;
  readonly exclusions?: readonly string[] | undefined;
  readonly sourceRoots?: readonly string[] | undefined;
  readonly shardWeight?: number | undefined;
};

type EntryPointRoots = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: string;
};

type EntryPointBypassReport = {
  readonly publicAlternativeBypasses: readonly {
    readonly source: string;
    readonly target: string;
    readonly publicEntryPoint: string;
    readonly dependencyKind: string;
  }[];
};

const ANALYZER_NAME = 'entry-points';
const PUBLIC_ALTERNATIVE_BYPASS = RULE_IDS.publicAlternativeBypass;
const runnerPath = checkoutModulePath(path.join(import.meta.dirname, 'entry-points-runner.mjs'));

export function createEntryPointAnalyzer({
  version,
  configurationHash,
  exclusions,
  sourceRoots = defaultSourceRoots,
  shardWeight = 1,
}: EntryPointSettings): {
  readonly name: string;
  readonly createInvocation: (roots: EntryPointRoots) => {
    command: string;
    args: string[];
    cwd: string;
  };
  readonly [field: string]: unknown;
} {
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

export function toEntryPointDiffFindings(report: EntryPointBypassReport): Finding[] {
  return report.publicAlternativeBypasses.map((bypass) => ({
    tool: ANALYZER_NAME,
    rule: PUBLIC_ALTERNATIVE_BYPASS,
    path: bypass.source,
    identity: `target:${bypass.target}`,
    message: `Import ${bypass.target} through ${bypass.publicEntryPoint} (${bypass.dependencyKind})`,
    classification: 'enforceable',
  }));
}
