import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const RC_FILES = [
  '.mocharc.cjs',
  '.mocharc.js',
  '.mocharc.yaml',
  '.mocharc.yml',
  '.mocharc.jsonc',
  '.mocharc.json',
];
const FILE_OPTIONS = new Set(['--config', '--package']);
const LIST_OPTIONS = ['require', 'file', 'ignore', 'extension'];
const MOCHA_DEFAULT_SPEC = 'test';
const REGEXP_SPECIAL = /[$()*+.?[\\\]^{|}]/gu;
const V8_PREFIX = 'v8-';

function projectFile(projectRoot, name) {
  const file = path.resolve(projectRoot, name);
  return file.startsWith(`${projectRoot}${path.sep}`) ? file : undefined;
}

export function projectMocha(projectRoot) {
  const manifest = projectFile(projectRoot, 'package.json');
  const require = createRequire(manifest ?? projectRoot);
  try {
    const manifestPath = require.resolve('mocha/package.json');
    return {
      root: path.dirname(manifestPath),
      major: Number.parseInt(require(manifestPath).version, 10),
      require,
    };
  } catch {
    return undefined;
  }
}

function mochaModule(mocha, name) {
  const modern = path.resolve(mocha.root, 'lib', 'cli', `${name}.cjs`);
  if (!modern.startsWith(`${mocha.root}${path.sep}`)) {
    throw new Error(`Mocha module ${name} is outside the Mocha package`);
  }
  return mocha.require(existsSync(modern) ? modern : modern.replace(/\.cjs$/u, '.js'));
}

function optionNames(tokens) {
  return new Set(tokens.map((token) => token.split('=')[0]));
}

function sourceArguments(projectRoot, tokens) {
  const names = optionNames(tokens);
  const rc = RC_FILES.map((name) => projectFile(projectRoot, name)).find(
    (file) => file !== undefined && existsSync(file),
  );
  const manifest = projectFile(projectRoot, 'package.json');
  const config = rc === undefined ? ['--no-config'] : ['--config', rc];
  const pkg =
    manifest !== undefined && existsSync(manifest) ? ['--package', manifest] : ['--no-package'];
  return [
    ...(names.has('--config') || names.has('--no-config') ? [] : config),
    ...(names.has('--package') || names.has('--no-package') ? [] : pkg),
  ];
}

function absoluteFileOptions(projectRoot, tokens) {
  return tokens.map((token, index) => {
    const [name, ...value] = token.split('=');
    if (FILE_OPTIONS.has(tokens[index - 1] ?? '')) {
      return path.resolve(projectRoot, token);
    }
    return FILE_OPTIONS.has(name) && value.length > 0
      ? `${name}=${path.resolve(projectRoot, value.join('='))}`
      : token;
  });
}

function isDirectory(projectRoot, entry) {
  const file = projectFile(projectRoot, entry);
  return file !== undefined && existsSync(file) && statSync(file).isDirectory();
}

function recursiveGlob(entry, extensions) {
  const pattern = extensions.length === 1 ? extensions[0] : `{${extensions.join(',')}}`;
  return `${entry.replace(/\/+$/u, '')}/**/*.${pattern}`;
}

function specEntries(projectRoot, loaded, testFiles) {
  const named = [...loaded._.map(String), ...testFiles];
  if (loaded.recursive !== true) {
    return named;
  }
  const entries = named.length === 0 ? [MOCHA_DEFAULT_SPEC] : named;
  const extensions = loaded.extension ?? [];
  return entries.map((entry) =>
    isDirectory(projectRoot, entry) ? recursiveGlob(entry, extensions) : entry,
  );
}

function grepOption(loaded) {
  if (typeof loaded.grep === 'string') {
    return { grep: loaded.grep };
  }
  return typeof loaded.fgrep === 'string'
    ? { grep: loaded.fgrep.replaceAll(REGEXP_SPECIAL, String.raw`\$&`) }
    : {};
}

function strykerMochaOptions(loaded, spec) {
  const lists = LIST_OPTIONS.filter((key) => Array.isArray(loaded[key]) && loaded[key].length > 0);
  return {
    'no-config': true,
    'no-package': true,
    ...Object.fromEntries(lists.map((key) => [key, loaded[key].map(String)])),
    ...(typeof loaded.ui === 'string' ? { ui: loaded.ui } : {}),
    ...grepOption(loaded),
    ...(loaded['async-only'] === true ? { 'async-only': true } : {}),
    ...(spec.length === 0 ? {} : { spec }),
  };
}

function nodeFlagArguments(mocha, loaded) {
  const nodeOptions = loaded['node-option'];
  if (Array.isArray(nodeOptions) && nodeOptions.length > 0) {
    return nodeOptions.map((option) => `--${String(option)}`);
  }
  const flags = mochaModule(mocha, 'node-flags');
  const nodeFlags = Object.entries(loaded)
    .filter(([name]) => name !== '_' && flags.isNodeFlag(name))
    .map(([name, value]) => [
      name !== 'v8-options' && name.startsWith(V8_PREFIX) ? name.slice(V8_PREFIX.length) : name,
      value,
    ]);
  return flags.unparseNodeFlags(Object.fromEntries(nodeFlags));
}

export function mochaMutationOptions({ projectRoot, tokens, testFiles }) {
  const mocha = projectMocha(projectRoot);
  if (mocha === undefined) {
    throw new Error(`Mocha is not installed in ${projectRoot}, so its tests cannot be mutated.`);
  }
  const loaded = mochaModule(mocha, 'options').loadOptions([
    ...sourceArguments(projectRoot, tokens),
    ...absoluteFileOptions(projectRoot, tokens),
  ]);
  return {
    mochaOptions: strykerMochaOptions(loaded, specEntries(projectRoot, loaded, testFiles)),
    nodeArguments: nodeFlagArguments(mocha, loaded),
  };
}
