import path from 'node:path';
import { fieldOf, fieldsOf, isText, listOf } from '../../../../../shared/values/readers.mts';
import { domLast } from '../environments.mts';
import type {
  EnvironmentAlias,
  EnvironmentScope,
  Environments,
} from '../typed/environment-types.mts';

type JestConfig = Readonly<Record<string, unknown>>;

const ENVIRONMENT_NAMES: readonly (readonly [string, RegExp])[] = [
  ['node', /jest-environment-node|^node$/u],
  ['jsdom', /jsdom/u],
  ['happy-dom', /happy-dom/u],
];

function environmentName(testEnvironment: unknown): string | undefined {
  if (typeof testEnvironment !== 'string') {
    return undefined;
  }
  const normalized = testEnvironment.split(path.sep).join('/');
  return ENVIRONMENT_NAMES.find(([, pattern]) => pattern.test(normalized))?.[0];
}

export function stringList(value: unknown): string[] {
  return listOf(value).filter(isText);
}

function setupFilesOf(config: JestConfig): string[] {
  return [...stringList(config['setupFiles']), ...stringList(config['setupFilesAfterEnv'])];
}

function aliasesOf(config: JestConfig): EnvironmentAlias[] {
  return listOf(config['moduleNameMapper']).flatMap((mapper) => {
    const [pattern, target] = listOf(mapper);
    const replacement = [target].flat()[0];
    return typeof pattern === 'string' && typeof replacement === 'string'
      ? [{ find: { pattern, flags: '' }, replacement }]
      : [];
  });
}

export function relativeGlob(projectRoot: string, rootDir: string, pattern: string): string {
  if (path.isAbsolute(pattern)) {
    return path.relative(projectRoot, pattern).split(path.sep).join('/');
  }
  const prefix = path.relative(projectRoot, rootDir).split(path.sep).join('/');
  return path.posix.join(prefix, pattern);
}

function scopeOf(config: JestConfig, projectRoot: string): EnvironmentScope[] {
  const patterns = stringList(config['testMatch']);
  const hasRegex = stringList(config['testRegex']).length > 0;
  const { rootDir } = config;
  if (patterns.length === 0 || hasRegex || typeof rootDir !== 'string') {
    return [];
  }
  if (path.relative(projectRoot, rootDir).startsWith('..')) {
    return [];
  }
  const setupFiles = setupFilesOf(config);
  return [
    {
      files: patterns.map((pattern) => relativeGlob(projectRoot, rootDir, pattern)),
      ignores: [],
      environment: environmentName(config['testEnvironment']),
      ...(setupFiles.length === 0 ? {} : { setupFiles }),
    },
  ];
}

function uniqueAliases(configs: readonly JestConfig[]): EnvironmentAlias[] {
  const byKey = new Map(
    configs
      .flatMap(aliasesOf)
      .map((alias): [string, EnvironmentAlias] => [JSON.stringify(alias), alias]),
  );
  return [...byKey.values()];
}

function configsOf(showConfig: unknown): JestConfig[] {
  return listOf(fieldOf(showConfig, 'configs')).map((config) => fieldsOf(config));
}

export function environmentsFromJestConfig(showConfig: unknown, projectRoot: string): Environments {
  const configs = configsOf(showConfig);
  const aliases = uniqueAliases(configs);
  if (configs.length !== 1) {
    const scopes = domLast(configs.flatMap((config) => scopeOf(config, projectRoot)));
    return { environment: undefined, scopes, aliases };
  }
  const [config = {}] = configs;
  const setupFiles = setupFilesOf(config);
  return {
    environment: environmentName(config['testEnvironment']),
    scopes: [],
    aliases,
    ...(setupFiles.length === 0 ? {} : { setupFiles }),
  };
}
