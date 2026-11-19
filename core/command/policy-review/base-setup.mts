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
import { withBaseTestRunner as untypedWithBaseTestRunner } from '../../../languages/typescript/preset/diff/base-runner.mjs';
import { applyRunProfile, withoutTestRun } from '../../quick/profile.mts';
import { withoutTroubleshooting } from '../../../shared/messages/troubleshooting.mjs';
import type { Analyzer, ProfiledAnalyzer } from '../../../shared/values/analyzers.mts';
import { objectOf, textOf } from '../../../shared/values/readers.mts';
import type { NitpickerConfig, ProjectOverlay } from '../../../shared/values/config-types.mts';
import type {
  Loosening as PolicyLoosening,
  ScopeInputs,
} from '../../policy-changes/types/policy-types.mts';

type Warn = (message: string) => unknown;

type ResolverOptions = {
  readonly headConfig: NitpickerConfig;
  readonly headPolicy?: unknown;
  readonly injectedAnalyzers?: readonly Analyzer[] | undefined;
  readonly liveProjectRoot?: string | undefined;
  readonly overlay?: ProjectOverlay | undefined;
  readonly inherits?: string | undefined;
  readonly repositoryLoosenings?: readonly PolicyLoosening[];
  readonly profile?: object;
  readonly warn?: Warn;
};

type BaseSnapshot = {
  readonly baseProjectRoot: string;
  readonly headSnapshotRoot: string;
  readonly liveProjectRoot?: string | undefined;
  readonly moves: ScopeInputs['moves'];
  readonly analyzers: readonly Analyzer[];
};

type MeasuredBase = Omit<
  Required<ResolverOptions>,
  'warn' | 'injectedAnalyzers' | 'liveProjectRoot' | 'overlay' | 'inherits' | 'repositoryLoosenings'
> & {
  readonly baseConfig: NitpickerConfig;
  readonly injectedAnalyzers: readonly Analyzer[] | undefined;
  readonly analyzers: readonly Analyzer[];
};

type BaseSetupCli = {
  readonly currentProjectRoot?: string | undefined;
  readonly injectedAnalyzers: readonly Analyzer[] | undefined;
  readonly baseConfigOverlay?: ProjectOverlay | undefined;
  readonly configOverlay?: ProjectOverlay | undefined;
  readonly repositoryLoosenings?: readonly PolicyLoosening[] | undefined;
  readonly options: object;
  readonly stderr: { write(text: string): unknown };
};

const withBaseTestRunner: (
  setup: object,
  context: {
    readonly headPolicy: unknown;
    readonly baseProjectRoot: string;
    readonly liveProjectRoot: string | undefined;
    readonly analyzers: readonly Analyzer[];
    readonly warn: Warn;
  },
) => object = untypedWithBaseTestRunner;

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
    liveProjectRoot: cli.currentProjectRoot,
    injectedAnalyzers: cli.injectedAnalyzers,
    overlay: cli.baseConfigOverlay,
    inherits: cli.configOverlay?.inherits,
    repositoryLoosenings: cli.repositoryLoosenings ?? [],
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
  inherits,
  repositoryLoosenings = [],
  profile = {},
  warn,
}: ResolverOptions & { readonly headPolicy: unknown; readonly warn: Warn }): (
  snapshot: BaseSnapshot,
) => object {
  return ({ baseProjectRoot, headSnapshotRoot, liveProjectRoot, moves, analyzers }) => {
    const baseConfig = readBaseConfig(baseProjectRoot, warn, overlay);
    const compared = baseConfig ?? {};
    const scope = readPolicyScope({
      baseConfig: compared,
      headConfig,
      baseProjectRoot,
      headProjectRoot: headSnapshotRoot,
      liveProjectRoot: liveProjectRoot ?? headSnapshotRoot,
      moves,
      replacedOptions: undefined,
      inherits,
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
      ...policyChangeFields(compared, headConfig, { ...scope, repositoryLoosenings }),
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
