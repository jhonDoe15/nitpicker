import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { materializedDirectory } from './oxlint-inline-config.mjs';
import { baseUrlFreeOptions } from './oxlint-paths.mjs';

const STAGE_DIRECTORY = '.nitpicker-oxlint';

export function hideNestedTypeScriptConfigs(stage, projectRoot, files) {
  for (const directory of nestedConfigDirectories(projectRoot, files)) {
    const stageDirectory = materializedDirectory({
      stage,
      projectRoot,
      relativeDirectory: directory,
    });
    unlinkSync(path.join(stageDirectory, 'tsconfig.json'));
  }
}

function nestedConfigDirectories(projectRoot, files) {
  const directories = new Set(
    files.flatMap((file) => ancestorDirectories(path.posix.dirname(file))),
  );
  return [...directories]
    .sort()
    .filter((directory) => existsSync(path.join(projectRoot, directory, 'tsconfig.json')));
}

function ancestorDirectories(directory) {
  const segments = directory === '.' ? [] : directory.split('/');
  return segments.map((_segment, index) => segments.slice(0, index + 1).join('/'));
}

export function createStage(projectRoot, projectConfigPath) {
  const stage = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-')));
  for (const entry of readdirSync(projectRoot)) {
    if (projectConfigPath !== undefined && entry === 'tsconfig.json') continue;
    symlinkSync(path.join(projectRoot, entry), path.join(stage, entry));
  }
  if (projectConfigPath !== undefined) {
    writeFileSync(path.join(stage, 'tsconfig.json'), lintTypeScriptConfig(projectConfigPath));
  }
  mkdirSync(path.join(stage, STAGE_DIRECTORY));
  return stage;
}

function lintTypeScriptConfig(projectConfigPath) {
  const { config, error } = ts.parseConfigFileTextToJson(
    projectConfigPath,
    readFileSync(projectConfigPath, 'utf8'),
  );
  if (error !== undefined) {
    throw new Error(`Lint TypeScript config ${projectConfigPath} is not valid JSON`);
  }
  const rebased = {
    ...config,
    ...(config.extends === undefined
      ? {}
      : { extends: rebasedExtends(config.extends, path.dirname(projectConfigPath)) }),
  };
  return JSON.stringify({
    ...rebased,
    compilerOptions: {
      ...config.compilerOptions,
      ...baseUrlFreeOptions(rebased, projectConfigPath),
      noEmit: true,
    },
  });
}

function rebasedExtends(value, directory) {
  return Array.isArray(value)
    ? value.map((entry) => rebasedExtend(entry, directory))
    : rebasedExtend(value, directory);
}

function rebasedExtend(value, directory) {
  return value.startsWith('./') || value.startsWith('../') ? path.resolve(directory, value) : value;
}

export function writeStageConfigs({ stage, projectRoot, sampleFile, translation }) {
  const bridge = pathToFileURL(path.join(import.meta.dirname, '..', 'oxlint-bridge.mjs')).href;
  const jsPlugins = translation.plugins.map((plugin) => {
    const request = { ...plugin, projectRoot, sampleFile };
    writeFileSync(
      path.join(stage, STAGE_DIRECTORY, `${plugin.alias}.mjs`),
      `import { bridgedPlugin } from ${JSON.stringify(bridge)};\nexport default await bridgedPlugin(${JSON.stringify(request)});\n`,
    );
    return `./${STAGE_DIRECTORY}/${plugin.alias}.mjs`;
  });
  const bridgedRulePrefixes = translation.plugins.map(({ alias }) => `${alias}/`);
  return translation.partitions.map((partition, index) => {
    const configPath = path.join(stage, `${STAGE_DIRECTORY}rc-${String(index)}.json`);
    const nativeConfigPath = path.join(stage, `${STAGE_DIRECTORY}rc-${String(index)}-native.json`);
    const config = stageConfig(partition, jsPlugins);
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    writeFileSync(nativeConfigPath, JSON.stringify(nativeConfig(config, bridgedRulePrefixes)));
    return { configPath, nativeConfigPath, files: partition.files };
  });
}

function nativeConfig(config, bridgedRulePrefixes) {
  return {
    ...config,
    jsPlugins: [],
    overrides: config.overrides.map((override) => ({
      ...override,
      rules: nativeRules(override.rules ?? {}, bridgedRulePrefixes),
    })),
  };
}

function nativeRules(rules, bridgedRulePrefixes) {
  return Object.fromEntries(
    Object.entries(rules).filter(
      ([rule]) => !bridgedRulePrefixes.some((prefix) => rule.startsWith(prefix)),
    ),
  );
}

function stageConfig({ settings, overrides }, jsPlugins) {
  const categories = [
    'correctness',
    'suspicious',
    'pedantic',
    'perf',
    'restriction',
    'style',
    'nursery',
  ];
  return {
    plugins: ['typescript', 'vitest'],
    jsPlugins,
    categories: Object.fromEntries(categories.map((category) => [category, 'off'])),
    settings,
    overrides,
  };
}
