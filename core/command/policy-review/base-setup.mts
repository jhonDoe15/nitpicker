import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mts';
import {
  ANALYZER_TIMEOUT_KEY,
  withConfiguredTimeout,
} from '../../../shared/analyzer-timeouts/analyzer-timeouts.mts';
import { resolveHeadPolicy } from '../../../shared/head-policy.mts';
import { withHeadCheckoutFacts } from '../../../languages/typescript/preset/head-policy.mts';
import { describeConfigOverrides, readConfigFile } from '../../configuration/config.mts';
import { baseConfigCoveringHead } from '../base-config/base-coverage.mts';
import { configureAll, presetAnalyzers } from '../../configuration/preset-analyzers.mts';
import { withBaseTestRunner as untypedWithBaseTestRunner } from '../../../languages/typescript/preset/diff/base-runner.mts';
import { applyRunProfile, withoutTestRun } from '../../quick/profile.mts';
import { withoutTroubleshooting } from '../../../shared/messages/troubleshooting.mts';
import type { Analyzer, ProfiledAnalyzer } from '../../../shared/values/analyzers.mts';
import { callUntyped } from '../../../shared/values/boundaries/untyped-call.mts';
import { objectOf, textOf } from '../../../shared/values/readers.mts';
import type { NitpickerConfig, ProjectOverlay } from '../../../shared/values/config-types.mts';

type Warn = (message: string) => unknown;

type ResolverOptions = {
  readonly headConfig: NitpickerConfig;
  readonly headPolicy?: unknown;
  readonly injectedAnalyzers?: readonly Analyzer[] | undefined;
  readonly liveProjectRoot?: string | undefined;
  readonly overlay?: ProjectOverlay | undefined;
  readonly profile?: object;
  readonly warn?: Warn;
};

type BaseSnapshot = {
  readonly baseProjectRoot: string;
  readonly liveProjectRoot?: string | undefined;
  readonly analyzers: readonly Analyzer[];
};

type MeasuredBase = Omit<
  Required<ResolverOptions>,
  'warn' | 'injectedAnalyzers' | 'liveProjectRoot' | 'overlay'
> & {
  readonly baseConfig: NitpickerConfig;
  readonly injectedAnalyzers: readonly Analyzer[] | undefined;
  readonly analyzers: readonly Analyzer[];
};

type BaseSetupCli = {
  readonly currentProjectRoot?: string | undefined;
  readonly injectedAnalyzers: readonly Analyzer[] | undefined;
  readonly baseConfigOverlay?: ProjectOverlay | undefined;
  readonly options: object;
  readonly stderr: { write(text: string): unknown };
};

type BaseRunnerContext = {
  readonly headPolicy: unknown;
  readonly baseProjectRoot: string;
  readonly liveProjectRoot: string | undefined;
  readonly analyzers: readonly Analyzer[];
  readonly warn: Warn;
};

function withBaseTestRunner(setup: object, context: BaseRunnerContext): object {
  const result: unknown = callUntyped(untypedWithBaseTestRunner, setup, context);
  return objectOf(result) ?? {};
}

const configuredTimeout: (analyzer: Analyzer, timeouts: object | undefined) => Analyzer =
  withConfiguredTimeout;

function readBaseConfig(
  baseProjectRoot: string,
  warn: Warn,
  overlay: ProjectOverlay | undefined,
): NitpickerConfig | undefined {
  if (overlay === undefined && !existsSync(path.join(baseProjectRoot, CONFIG_FILE_NAME))) {
    return undefined;
  }
  try {
    return readConfigFile(baseProjectRoot, { overlay });
  } catch (error) {
    const reason = textOf(
      withoutTroubleshooting(error instanceof Error ? error.message : String(error)),
    );
    warn(
      `The base's ${CONFIG_FILE_NAME} cannot be applied (${reason}); the base is analysed with the head config.`,
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
    liveProjectRoot: cli.currentProjectRoot,
    injectedAnalyzers: cli.injectedAnalyzers,
    overlay: cli.baseConfigOverlay,
    profile: cli.options,
    warn: (message) => cli.stderr.write(`nitpicker: ${message}\n`),
  });
}

export function createBaseSetupResolver(
  options: ResolverOptions,
): (snapshot: BaseSnapshot) => object {
  const headPolicy: unknown = options.headPolicy ?? {};
  const warn: Warn = options.warn ?? (() => undefined);
  const configured = configuredBaseSetup({ ...options, headPolicy, warn });
  return (snapshot) =>
    withBaseTestRunner(configured(snapshot), {
      headPolicy,
      baseProjectRoot: snapshot.baseProjectRoot,
      liveProjectRoot: snapshot.liveProjectRoot ?? options.liveProjectRoot,
      analyzers: snapshot.analyzers,
      warn,
    });
}

function configuredBaseSetup({
  headConfig,
  headPolicy,
  injectedAnalyzers,
  overlay,
  profile = {},
  warn,
}: ResolverOptions & { readonly headPolicy: unknown; readonly warn: Warn }): (
  snapshot: BaseSnapshot,
) => object {
  return ({ baseProjectRoot, analyzers }) => {
    const baseConfig = readBaseConfig(baseProjectRoot, warn, overlay);
    const unchanged = JSON.stringify(baseConfig ?? {}) === JSON.stringify(headConfig);
    return baseConfig === undefined || unchanged
      ? {}
      : measuredBase({
          baseConfig,
          headConfig,
          headPolicy,
          injectedAnalyzers,
          profile,
          analyzers,
        });
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
  const baseHeadPolicy: unknown = callUntyped(
    withHeadCheckoutFacts,
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
