import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../shared/config.mjs';
import { resolveHeadPolicy } from '../../shared/head-policy.mjs';
import { configureAnalyzers } from './configure-analyzers.mjs';
import { describeConfigOverrides, loadConfig } from './config.mjs';
import { presetAnalyzers } from './preset-analyzers.mjs';

export function createBaseSetupResolver({ headConfig, injectedAnalyzers, warn = () => undefined }) {
  return ({ baseProjectRoot, analyzers }) => {
    if (!existsSync(path.join(baseProjectRoot, CONFIG_FILE_NAME))) {
      return {};
    }
    try {
      return baseSetupFromConfig({
        baseConfig: loadConfig(baseProjectRoot),
        headConfig,
        injectedAnalyzers,
        analyzers,
      });
    } catch (error) {
      warn(
        `The base's ${CONFIG_FILE_NAME} cannot be applied (${error instanceof Error ? error.message : String(error)}); the base is analysed with the head config.`,
      );
      return {};
    }
  };
}

function baseSetupFromConfig({ baseConfig, headConfig, injectedAnalyzers, analyzers }) {
  if (JSON.stringify(baseConfig) === JSON.stringify(headConfig)) {
    return {};
  }
  const baseHeadPolicy = resolveHeadPolicy(baseConfig);
  const configured = new Map(
    configureAnalyzers(
      presetAnalyzers(baseConfig, injectedAnalyzers),
      baseConfig,
      baseHeadPolicy,
    ).map((analyzer) => [analyzer.name, analyzer]),
  );
  return {
    analyzers: analyzers.map((analyzer) => configured.get(analyzer.name) ?? analyzer),
    headPolicy: baseHeadPolicy,
    configOverrides: describeConfigOverrides(baseConfig),
  };
}
