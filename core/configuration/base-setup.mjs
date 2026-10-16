import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../shared/config.mjs';
import { resolveHeadPolicy } from '../../shared/head-policy.mjs';
import { configureAnalyzers } from './configure-analyzers.mjs';
import { describeConfigOverrides, loadConfig } from './config.mjs';
import { presetAnalyzers } from './preset-analyzers.mjs';

export function baseSetupResolver(cli, headConfig, headPolicy) {
  return createBaseSetupResolver({
    headConfig,
    conventions: headPolicy.conventions,
    injectedAnalyzers: cli.injectedAnalyzers,
    warn: (message) => cli.stderr.write(`nitpicker: ${message}\n`),
  });
}

export function createBaseSetupResolver({
  headConfig,
  conventions,
  injectedAnalyzers,
  warn = () => undefined,
}) {
  return ({ baseProjectRoot, analyzers }) => {
    if (!existsSync(path.join(baseProjectRoot, CONFIG_FILE_NAME))) {
      return {};
    }
    try {
      return baseSetupFromConfig({
        baseConfig: loadConfig(baseProjectRoot),
        headConfig,
        conventions,
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

function withHeadDuplicates(baseConfig, headConfig) {
  const { duplicates } = headConfig;
  const entries = Object.entries(baseConfig).flatMap(([key, value]) => {
    if (key !== 'duplicates') {
      return [[key, value]];
    }
    return duplicates === undefined ? [] : [[key, duplicates]];
  });
  return Object.fromEntries(
    'duplicates' in baseConfig || duplicates === undefined
      ? entries
      : [...entries, ['duplicates', duplicates]],
  );
}

function baseSetupFromConfig({
  baseConfig: committedBaseConfig,
  headConfig,
  conventions,
  injectedAnalyzers,
  analyzers,
}) {
  const baseConfig = withHeadDuplicates(committedBaseConfig, headConfig);
  if (JSON.stringify(baseConfig) === JSON.stringify(headConfig)) {
    return {};
  }
  const baseHeadPolicy = {
    ...resolveHeadPolicy(baseConfig),
    ...(conventions === undefined ? {} : { conventions }),
  };
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
