import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { resolveHeadPolicy } from '../../../shared/head-policy.mjs';
import { withHeadCheckoutFacts } from '../../../languages/typescript/preset/head-policy.mjs';
import { configureAnalyzers } from '../../configuration/configure-analyzers.mjs';
import { describeConfigOverrides, readConfigFile } from '../../configuration/config.mjs';
import { baseConfigCoveringHead } from '../../policy-changes/base-coverage.mjs';
import { policyChangeFields } from '../../policy-changes/describe-policy-changes.mjs';
import { readPolicyScope } from '../../policy-changes/policy-scope.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mjs';

function readBaseConfig(baseProjectRoot, warn, overlay) {
  if (overlay === undefined && !existsSync(path.join(baseProjectRoot, CONFIG_FILE_NAME))) {
    return undefined;
  }
  try {
    return readConfigFile(baseProjectRoot, { overlay });
  } catch (error) {
    warn(
      `The base's ${CONFIG_FILE_NAME} cannot be applied (${error instanceof Error ? error.message : String(error)}); the base is analysed with the head config, and the head config is compared with the defaults.`,
    );
    return undefined;
  }
}

export function baseSetupResolver(cli, headConfig, headPolicy) {
  return createBaseSetupResolver({
    headConfig,
    headPolicy,
    injectedAnalyzers: cli.injectedAnalyzers,
    overlay: cli.baseConfigOverlay,
    inherits: cli.configOverlay?.inherits,
    repositoryLoosenings: cli.repositoryLoosenings,
    warn: (message) => cli.stderr.write(`nitpicker: ${message}\n`),
  });
}

export function createBaseSetupResolver({
  headConfig,
  headPolicy = {},
  injectedAnalyzers,
  overlay,
  inherits,
  repositoryLoosenings = [],
  warn = () => undefined,
}) {
  return ({ baseProjectRoot, headSnapshotRoot, moves, analyzers }) => {
    const baseConfig = readBaseConfig(baseProjectRoot, warn, overlay);
    const compared = baseConfig ?? {};
    const scope = readPolicyScope({
      baseConfig: compared,
      headConfig,
      baseProjectRoot,
      headProjectRoot: headSnapshotRoot,
      moves,
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
            analyzers,
          })),
      ...policyChangeFields(compared, headConfig, { ...scope, repositoryLoosenings }),
    };
  };
}

function measuredBase({ baseConfig, headConfig, headPolicy, injectedAnalyzers, analyzers }) {
  const measured = baseConfigCoveringHead(baseConfig, headConfig);
  const baseHeadPolicy = withHeadCheckoutFacts(resolveHeadPolicy(measured), headPolicy);
  const configured = new Map(
    configureAnalyzers(presetAnalyzers(measured, injectedAnalyzers), measured, baseHeadPolicy).map(
      (analyzer) => [analyzer.name, analyzer],
    ),
  );
  return {
    analyzers: analyzers.map((analyzer) => configured.get(analyzer.name) ?? analyzer),
    headPolicy: baseHeadPolicy,
    configOverrides: describeConfigOverrides(measured),
  };
}
