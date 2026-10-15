import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../shared/config.mjs';
import { resolveHeadPolicy } from '../shared/head-policy.mjs';
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

function withoutExceptions(settings) {
  return Object.fromEntries(Object.entries(settings ?? {}).filter(([key]) => key !== 'exceptions'));
}

function withHeadExceptions(baseConfig, headConfig) {
  const headPython = headConfig.python?.exceptions;
  const python = {
    ...withoutExceptions(baseConfig.python),
    ...(headPython === undefined ? {} : { exceptions: headPython }),
  };
  const hasPython = Object.keys(python).length > 0 || headConfig.python !== undefined;
  const rest = Object.fromEntries(
    Object.entries({ ...baseConfig, python: hasPython ? python : undefined }).filter(
      ([key, value]) => key !== 'exceptions' && value !== undefined,
    ),
  );
  return headConfig.exceptions === undefined
    ? rest
    : { ...rest, exceptions: headConfig.exceptions };
}

function baseSetupFromConfig({ baseConfig: ownConfig, headConfig, injectedAnalyzers, analyzers }) {
  const baseConfig = withHeadExceptions(ownConfig, headConfig);
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
