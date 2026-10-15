import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../shared/config.mjs';
import { resolveHeadPolicy } from '../shared/head-policy.mjs';
import { configureAnalyzers } from './configure-analyzers.mjs';
import { describeConfigOverrides, readConfigFile } from './config.mjs';
import { baseConfigCoveringHead } from './policy-changes/base-coverage.mjs';
import { policyChangeFields } from './policy-changes/describe-policy-changes.mjs';
import { excludedFileNotices } from './policy-changes/excluded-files.mjs';
import { readPolicyScope } from './policy-changes/policy-scope.mjs';
import { presetAnalyzers } from './preset-analyzers.mjs';

function readBaseConfig(baseProjectRoot, warn) {
  if (!existsSync(path.join(baseProjectRoot, CONFIG_FILE_NAME))) {
    return undefined;
  }
  try {
    return readConfigFile(baseProjectRoot);
  } catch (error) {
    warn(
      `The base's ${CONFIG_FILE_NAME} cannot be applied (${error instanceof Error ? error.message : String(error)}); the base is analysed with the head config, and the head config is compared with the defaults.`,
    );
    return undefined;
  }
}

export function createBaseSetupResolver({ headConfig, injectedAnalyzers, warn = () => undefined }) {
  return ({ baseProjectRoot, headSnapshotRoot, moves, analyzers }) => {
    const baseConfig = readBaseConfig(baseProjectRoot, warn);
    const compared = baseConfig ?? {};
    const scope = readPolicyScope({
      baseConfig: compared,
      headConfig,
      baseProjectRoot,
      headProjectRoot: headSnapshotRoot,
      moves,
    });
    const unchanged = JSON.stringify(compared) === JSON.stringify(headConfig);
    return {
      ...(baseConfig === undefined || unchanged
        ? {}
        : measuredBase({ baseConfig, headConfig, injectedAnalyzers, analyzers })),
      ...(unchanged ? {} : policyChangeFields(compared, headConfig, scope)),
      notices: excludedFileNotices({ baseConfig: compared, headConfig, scope, baseProjectRoot }),
    };
  };
}

function measuredBase({ baseConfig, headConfig, injectedAnalyzers, analyzers }) {
  const measured = baseConfigCoveringHead(baseConfig, headConfig);
  const baseHeadPolicy = resolveHeadPolicy(measured);
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
