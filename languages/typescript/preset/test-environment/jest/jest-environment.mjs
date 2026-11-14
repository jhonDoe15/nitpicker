import path from 'node:path';
import { domLast } from '../environments.mjs';

const ENVIRONMENT_NAMES = [
  ['node', /jest-environment-node|^node$/u],
  ['jsdom', /jsdom/u],
  ['happy-dom', /happy-dom/u],
];

function environmentName(testEnvironment) {
  if (typeof testEnvironment !== 'string') {
    return undefined;
  }
  const normalized = testEnvironment.split(path.sep).join('/');
  return ENVIRONMENT_NAMES.find(([, pattern]) => pattern.test(normalized))?.[0];
}

export function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function setupFilesOf(config) {
  return [...stringList(config.setupFiles), ...stringList(config.setupFilesAfterEnv)];
}

function aliasesOf(config) {
  const mappers = Array.isArray(config.moduleNameMapper) ? config.moduleNameMapper : [];
  return mappers
    .map(([pattern, target]) => ({ pattern, replacement: [target].flat()[0] }))
    .filter(
      ({ pattern, replacement }) => typeof pattern === 'string' && typeof replacement === 'string',
    )
    .map(({ pattern, replacement }) => ({ find: { pattern, flags: '' }, replacement }));
}

export function relativeGlob(projectRoot, rootDir, pattern) {
  if (path.isAbsolute(pattern)) {
    return path.relative(projectRoot, pattern).split(path.sep).join('/');
  }
  const prefix = path.relative(projectRoot, rootDir).split(path.sep).join('/');
  return path.posix.join(prefix, pattern);
}

function scopeOf(config, projectRoot) {
  const patterns = stringList(config.testMatch);
  const hasRegex = stringList(config.testRegex).length > 0;
  const inside =
    typeof config.rootDir === 'string' &&
    !path.relative(projectRoot, config.rootDir).startsWith('..');
  if (patterns.length === 0 || hasRegex || !inside) {
    return [];
  }
  const setupFiles = setupFilesOf(config);
  return [
    {
      files: patterns.map((pattern) => relativeGlob(projectRoot, config.rootDir, pattern)),
      ignores: [],
      environment: environmentName(config.testEnvironment),
      ...(setupFiles.length === 0 ? {} : { setupFiles }),
    },
  ];
}

function uniqueAliases(configs) {
  const byKey = new Map(configs.flatMap(aliasesOf).map((alias) => [JSON.stringify(alias), alias]));
  return [...byKey.values()];
}

export function environmentsFromJestConfig(showConfig, projectRoot) {
  const configs = Array.isArray(showConfig?.configs) ? showConfig.configs : [];
  const aliases = uniqueAliases(configs);
  if (configs.length !== 1) {
    const scopes = domLast(configs.flatMap((config) => scopeOf(config, projectRoot)));
    return { environment: undefined, scopes, aliases };
  }
  const [config] = configs;
  const setupFiles = setupFilesOf(config);
  return {
    environment: environmentName(config.testEnvironment),
    scopes: [],
    aliases,
    ...(setupFiles.length === 0 ? {} : { setupFiles }),
  };
}
