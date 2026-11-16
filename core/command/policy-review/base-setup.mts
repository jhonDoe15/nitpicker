import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import {
  ANALYZER_TIMEOUT_KEY,
  withConfiguredTimeout,
} from '../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';
import { resolveHeadPolicy } from '../../../shared/head-policy.mjs';
import { withHeadCheckoutFacts } from '../../../languages/typescript/preset/head-policy.mjs';
import { describeConfigOverrides, readConfigFile } from '../../configuration/config.mts';
import { baseConfigCoveringHead } from '../../policy-changes/base-coverage.mts';
import { policyChangeFields } from '../../policy-changes/describe-policy-changes.mts';
import { readPolicyScope } from '../../policy-changes/policy-scope.mts';
import { configureAll, presetAnalyzers } from '../../configuration/preset-analyzers.mts';
import { applyRunProfile, withoutTestRun } from '../../quick/profile.mts';
import { withoutTroubleshooting } from '../../../shared/messages/troubleshooting.mjs';
import type { Analyzer, ProfiledAnalyzer } from '../../../shared/values/analyzers.mts';
import { objectOf, textOf } from '../../../shared/values/readers.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import type { ScopeInputs } from '../../policy-changes/types/policy-types.mts';

type Warn = (message: string) => unknown;

type ResolverOptions = {
  readonly headConfig: NitpickerConfig;
  readonly headPolicy?: unknown;
  readonly injectedAnalyzers?: readonly Analyzer[] | undefined;
  readonly profile?: object;
  readonly warn?: Warn;
};

type BaseSnapshot = {
  readonly baseProjectRoot: string;
  readonly headSnapshotRoot: string;
  readonly liveProjectRoot: string;
  readonly moves: ScopeInputs['moves'];
  readonly analyzers: readonly Analyzer[];
};

type MeasuredBase = Omit<Required<ResolverOptions>, 'warn' | 'injectedAnalyzers'> & {
  readonly baseConfig: NitpickerConfig;
  readonly injectedAnalyzers: readonly Analyzer[] | undefined;
  readonly analyzers: readonly Analyzer[];
};

type BaseSetupCli = {
  readonly injectedAnalyzers: readonly Analyzer[] | undefined;
  readonly options: object;
  readonly stderr: { write(text: string): unknown };
};

const configuredTimeout: (analyzer: Analyzer, timeouts: object | undefined) => Analyzer =
  withConfiguredTimeout;

function readBaseConfig(baseProjectRoot: string, warn: Warn): NitpickerConfig | undefined {
  if (!existsSync(path.join(baseProjectRoot, CONFIG_FILE_NAME))) {
    return undefined;
  }
  try {
    return readConfigFile(baseProjectRoot);
  } catch (error) {
    const reason = textOf(
      withoutTroubleshooting(error instanceof Error ? error.message : String(error)),
    );
    warn(
      `The base's ${CONFIG_FILE_NAME} cannot be applied (${reason}); the base is analysed with the head config, and the head config is compared with the defaults.`,
    );
    return undefined;
  }
}

export function baseSetupResolver(
  cli: BaseSetupCli,
  headConfig: NitpickerConfig,
  headPolicy: unknown,
): (snapshot: BaseSnapshot) => object {
  return createBaseSetupResolver({
    headConfig,
    headPolicy,
    injectedAnalyzers: cli.injectedAnalyzers,
    profile: cli.options,
    warn: (message) => cli.stderr.write(`nitpicker: ${message}\n`),
  });
}

export function createBaseSetupResolver({
  headConfig,
  headPolicy = {},
  injectedAnalyzers,
  profile = {},
  warn = () => undefined,
}: ResolverOptions): (snapshot: BaseSnapshot) => object {
  return ({ baseProjectRoot, headSnapshotRoot, liveProjectRoot, moves, analyzers }) => {
    const baseConfig = readBaseConfig(baseProjectRoot, warn);
    const compared = baseConfig ?? {};
    const scope = readPolicyScope({
      baseConfig: compared,
      headConfig,
      baseProjectRoot,
      headProjectRoot: headSnapshotRoot,
      liveProjectRoot,
      moves,
      replacedOptions: undefined,
    });
    const unchanged = JSON.stringify(compared) === JSON.stringify(headConfig);
    return {
      ...(baseConfig === undefined || unchanged
        ? {}
        : measuredBase({
            baseConfig,
            headConfig,
            headPolicy,
            injectedAnalyzers,
            profile,
            analyzers,
          })),
      ...policyChangeFields(compared, headConfig, scope),
    };
  };
}

function withoutTimeouts(config: NitpickerConfig): NitpickerConfig {
  return Object.fromEntries(Object.entries(config).filter(([key]) => key !== ANALYZER_TIMEOUT_KEY));
}

function sameMode(base: ProfiledAnalyzer, head: Analyzer): ProfiledAnalyzer {
  return head['quick'] === true && base.quick !== true
    ? (withoutTestRun([base]).analyzers[0] ?? base)
    : base;
}

function measuredBase({
  baseConfig,
  headConfig,
  headPolicy,
  injectedAnalyzers,
  profile,
  analyzers,
}: MeasuredBase): object {
  const measured = withoutTimeouts(baseConfigCoveringHead(baseConfig, headConfig));
  const baseHeadPolicy: unknown = withHeadCheckoutFacts(
    resolveHeadPolicy(measured),
    objectOf(headPolicy),
  );
  const configured = new Map(
    applyRunProfile(
      configureAll(presetAnalyzers(measured, injectedAnalyzers), measured, baseHeadPolicy),
      { ...profile, analyzerNames: [] },
    ).analyzers.map((analyzer) => [analyzer.name, analyzer]),
  );
  const timeouts = objectOf(headConfig[ANALYZER_TIMEOUT_KEY]);
  return {
    analyzers: analyzers.map((analyzer) => {
      const found = configured.get(analyzer.name);
      return found === undefined
        ? analyzer
        : configuredTimeout(sameMode(found, analyzer), timeouts);
    }),
    headPolicy: baseHeadPolicy,
    configOverrides: describeConfigOverrides(measured),
  };
}
