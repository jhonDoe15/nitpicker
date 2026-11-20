import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../../shared/messages/troubleshooting.mjs';
import { fieldOf, fieldsOf, listOf, textsOf } from '../../../../../shared/values/readers.mts';
import { mochaSources } from '../mocha-config-files.mts';

type MochaOptions = Readonly<Record<string, unknown>>;

type MochaInstall = {
  readonly root: string;
  readonly major: number;
  readonly require: NodeJS.Require;
};

type MochaMutationRequest = {
  readonly projectRoot: string;
  readonly tokens: readonly string[];
  readonly testFiles: readonly string[];
};

type MochaMutationOptions = {
  readonly mochaOptions: {
    readonly require?: readonly string[];
    readonly [option: string]: unknown;
  };
  readonly nodeArguments: readonly string[];
};

const CONFIG_OPTION = '--config';
const PACKAGE_OPTION = '--package';
const FILE_OPTIONS = new Set([CONFIG_OPTION, PACKAGE_OPTION]);
const LIST_OPTIONS = ['require', 'file', 'ignore', 'extension'];
const MOCHA_DEFAULT_SPEC = 'test';
const REGEXP_SPECIAL = /[$()*+.?[\\\]^{|}]/gu;
const V8_PREFIX = 'v8-';

export function projectFile(projectRoot: string, name: string): string | undefined {
  const file = path.resolve(projectRoot, name);
  return file.startsWith(`${projectRoot}${path.sep}`) ? file : undefined;
}

export function projectMocha(projectRoot: string): MochaInstall | undefined {
  const manifest = projectFile(projectRoot, 'package.json');
  const require = createRequire(manifest ?? projectRoot);
  try {
    const manifestPath = require.resolve('mocha/package.json');
    return {
      root: path.dirname(manifestPath),
      major: Number.parseInt(String(fieldOf(require(manifestPath), 'version')), 10),
      require,
    };
  } catch (error) {
    if (fieldOf(error, 'code') !== 'MODULE_NOT_FOUND') {
      throw new Error(`Could not read the Mocha installed for ${projectRoot}`, { cause: error });
    }
    return undefined;
  }
}

export function mochaModulePath(mocha: { readonly root: string }, name: string): string {
  const modern = path.resolve(mocha.root, 'lib', 'cli', `${name}.cjs`);
  if (!modern.startsWith(`${mocha.root}${path.sep}`)) {
    throw new Error(`Mocha module ${name} is outside the Mocha package`);
  }
  return existsSync(modern) ? modern : modern.replace(/\.cjs$/u, '.js');
}

function mochaModule(mocha: MochaInstall, name: string): unknown {
  return mocha.require(mochaModulePath(mocha, name));
}

function callModule(loadedModule: unknown, name: string, ...values: readonly unknown[]): unknown {
  const method = fieldOf(loadedModule, name);
  if (typeof method !== 'function') {
    throw new TypeError(`The Mocha module has no ${name} function`);
  }
  return Reflect.apply(method, loadedModule, values);
}

function optionNames(tokens: readonly string[]): Set<string> {
  return new Set(tokens.map((token) => token.split('=')[0] ?? ''));
}

function sourceArguments(projectRoot: string, tokens: readonly string[]): string[] {
  const names = optionNames(tokens);
  const { config, package: manifest } = mochaSources(projectRoot);
  const configArguments =
    config === undefined ? ['--no-config'] : [CONFIG_OPTION, path.resolve(projectRoot, config)];
  const packageArguments =
    manifest === undefined
      ? ['--no-package']
      : [PACKAGE_OPTION, path.resolve(projectRoot, manifest)];
  return [
    ...(names.has(CONFIG_OPTION) || names.has('--no-config') ? [] : configArguments),
    ...(names.has(PACKAGE_OPTION) || names.has('--no-package') ? [] : packageArguments),
  ];
}

function absoluteFileOptions(projectRoot: string, tokens: readonly string[]): string[] {
  return tokens.map((token, index) => {
    const [name = '', ...value] = token.split('=');
    if (FILE_OPTIONS.has(tokens[index - 1] ?? '')) {
      return path.resolve(projectRoot, token);
    }
    return FILE_OPTIONS.has(name) && value.length > 0
      ? `${name}=${path.resolve(projectRoot, value.join('='))}`
      : token;
  });
}

function isDirectory(projectRoot: string, entry: string): boolean {
  const file = projectFile(projectRoot, entry);
  return file !== undefined && existsSync(file) && statSync(file).isDirectory();
}

function recursiveGlob(entry: string, extensions: readonly string[]): string {
  const pattern = extensions.length === 1 ? (extensions[0] ?? '') : `{${extensions.join(',')}}`;
  return `${entry.replace(/\/+$/u, '')}/**/*.${pattern}`;
}

function specEntries(
  projectRoot: string,
  loaded: MochaOptions,
  testFiles: readonly string[],
): string[] {
  const named = [...textsOf(loaded['_']), ...testFiles];
  if (loaded['recursive'] !== true) {
    return named;
  }
  const entries = named.length === 0 ? [MOCHA_DEFAULT_SPEC] : named;
  const extensions = textsOf(loaded['extension']);
  return entries.map((entry) =>
    isDirectory(projectRoot, entry) ? recursiveGlob(entry, extensions) : entry,
  );
}

function grepOption(loaded: MochaOptions): { grep?: string } {
  const { grep, fgrep } = loaded;
  if (typeof grep === 'string') {
    return { grep };
  }
  return typeof fgrep === 'string'
    ? { grep: fgrep.replaceAll(REGEXP_SPECIAL, (special: string) => `\\${special}`) }
    : {};
}

function strykerMochaOptions(
  loaded: MochaOptions,
  spec: readonly string[],
): MochaMutationOptions['mochaOptions'] {
  const lists = LIST_OPTIONS.filter((key) => listOf(loaded[key]).length > 0);
  return {
    'no-config': true,
    'no-package': true,
    ...Object.fromEntries(lists.map((key) => [key, textsOf(loaded[key])])),
    ...(typeof loaded['ui'] === 'string' ? { ui: loaded['ui'] } : {}),
    ...grepOption(loaded),
    ...(loaded['async-only'] === true ? { 'async-only': true } : {}),
    ...(spec.length === 0 ? {} : { spec }),
  };
}

function nodeFlagArguments(mocha: MochaInstall, loaded: MochaOptions): string[] {
  const nodeOptions = listOf(loaded['node-option']);
  if (nodeOptions.length > 0) {
    return nodeOptions.map((option) => `--${String(option)}`);
  }
  const flags = mochaModule(mocha, 'node-flags');
  const nodeFlags = Object.entries(loaded)
    .filter(([name]) => name !== '_' && Boolean(callModule(flags, 'isNodeFlag', name)))
    .map(([name, value]) => [
      name !== 'v8-options' && name.startsWith(V8_PREFIX) ? name.slice(V8_PREFIX.length) : name,
      value,
    ]);
  return textsOf(callModule(flags, 'unparseNodeFlags', Object.fromEntries(nodeFlags)));
}

export function mochaLoadArguments(projectRoot: string, tokens: readonly string[]): string[] {
  return [...sourceArguments(projectRoot, tokens), ...absoluteFileOptions(projectRoot, tokens)];
}

function loadedWith(
  mocha: MochaInstall,
  projectRoot: string,
  tokens: readonly string[],
): MochaOptions {
  const loaded = callModule(
    mochaModule(mocha, 'options'),
    'loadOptions',
    mochaLoadArguments(projectRoot, tokens),
  );
  return fieldsOf(loaded);
}

export function loadedMochaOptions({
  projectRoot,
  liveProjectRoot = projectRoot,
  tokens,
}: {
  readonly projectRoot: string;
  readonly liveProjectRoot?: string | undefined;
  readonly tokens: readonly string[];
}): MochaOptions | undefined {
  const mocha = projectMocha(projectRoot) ?? projectMocha(liveProjectRoot);
  return mocha === undefined ? undefined : loadedWith(mocha, projectRoot, tokens);
}

export function mochaMutationOptions({
  projectRoot,
  tokens,
  testFiles,
}: MochaMutationRequest): MochaMutationOptions {
  const mocha = projectMocha(projectRoot);
  if (mocha === undefined) {
    throw troubleshootingError(
      `Mocha is not installed in ${projectRoot}, so its tests cannot be mutated.`,
      TROUBLESHOOTING_ANCHORS.testRunnerNotInstalled,
    );
  }
  const loaded = loadedWith(mocha, projectRoot, tokens);
  return {
    mochaOptions: strykerMochaOptions(loaded, specEntries(projectRoot, loaded, testFiles)),
    nodeArguments: nodeFlagArguments(mocha, loaded),
  };
}
