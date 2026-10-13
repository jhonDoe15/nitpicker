import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { globToRegExpSource } from '../../../shared/glob.mjs';

export const MYPY_CONFIG = 'mypy.ini';
const GLOBAL_OPTIONS = [
  'plugins',
  'mypy_path',
  'python_version',
  'namespace_packages',
  'custom_typeshed_dir',
];
const MODULE_OPTIONS = ['ignore_missing_imports', 'follow_imports'];
const MODULE_PREFIX = 'mypy-';
const INI_FILES = ['mypy.ini', '.mypy.ini'];
const CONFIG_DIRECTORY_VARIABLE = /\$\{?MYPY_CONFIG_FILE_DIR\}?/g;
const PLUGIN_FILE = /^.+\.py(?=(?::\w+)?$)/;
const INI_SECTION = /^\[([^\]]+)\]\s*$/;
const INI_OPTION = /^([^\s=:][^=:]*?)\s*[=:]\s*(.*)$/;
const INI_COMMENT = /\s+[#;].*$/;

function toml() {
  return createRequire(import.meta.url)('smol-toml');
}

function parseIni(text) {
  const sections = new Map();
  let options;
  let key;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(INI_COMMENT, '');
    const section = INI_SECTION.exec(line.trim());
    const option = INI_OPTION.exec(line);
    if (line.trim() === '' || /^\s*[#;]/.test(line)) {
      key = undefined;
    } else if (section !== null && !/^\s/.test(line)) {
      options = new Map();
      sections.set(section[1].trim(), options);
      key = undefined;
    } else if (/^\s/.test(line) && key !== undefined) {
      options.set(key, `${options.get(key)}\n${line.trim()}`);
    } else if (option !== null && options !== undefined) {
      key = option[1].trim();
      options.set(key, option[2].trim());
    }
  }
  return sections;
}

function iniModel(sections) {
  if (!sections.has('mypy')) {
    return undefined;
  }
  const others = [...sections].filter(
    ([name]) => name !== 'mypy' && !name.startsWith(MODULE_PREFIX),
  );
  const modules = [...sections]
    .filter(([name]) => name.startsWith(MODULE_PREFIX))
    .map(([name, options]) => ({
      patterns: name
        .slice(MODULE_PREFIX.length)
        .split(',')
        .map((pattern) => pattern.trim()),
      options: Object.fromEntries(options),
    }));
  return {
    format: 'ini',
    options: Object.fromEntries(sections.get('mypy')),
    modules,
    others,
  };
}

function tomlModel(text) {
  const { tool = {} } = toml().parse(text);
  const { mypy, ...others } = tool;
  if (mypy === undefined) {
    return undefined;
  }
  const { overrides = [], ...options } = mypy;
  return {
    format: 'toml',
    options,
    modules: overrides
      .filter(({ module }) => module !== undefined)
      .map(({ module, ...rest }) => ({ patterns: [module].flat(), options: rest })),
    others,
  };
}

function readCandidate(projectRoot, name) {
  const file = path.join(projectRoot, name);
  if (!existsSync(file)) {
    return undefined;
  }
  const text = readFileSync(file, 'utf8');
  return name.endsWith('.toml') ? tomlModel(text) : iniModel(parseIni(text));
}

export function readMypyConfig(projectRoot) {
  return [...INI_FILES, 'pyproject.toml', 'setup.cfg']
    .map((name) => readCandidate(projectRoot, name))
    .find((model) => model !== undefined);
}

function pluginEntry(entry, projectRoot) {
  return entry.replace(PLUGIN_FILE, (file) => path.resolve(projectRoot, file));
}

function environmentValue(key, value, projectRoot) {
  const expand = (text) => text.replace(CONFIG_DIRECTORY_VARIABLE, projectRoot);
  if (key !== 'plugins') {
    return Array.isArray(value)
      ? value.map(expand)
      : typeof value === 'string'
        ? expand(value)
        : value;
  }
  const entries = (Array.isArray(value) ? value : value.split(','))
    .map((entry) => pluginEntry(expand(entry.trim()), projectRoot))
    .filter((entry) => entry !== '');
  return Array.isArray(value) ? entries : entries.join(', ');
}

function pick(options, keys, projectRoot) {
  return Object.fromEntries(
    keys
      .filter((key) => options[key] !== undefined)
      .map((key) => [key, environmentValue(key, options[key], projectRoot)]),
  );
}

function excludePattern(exclude) {
  const patterns = exclude.map((glob) => `${globToRegExpSource(glob).slice(1, -1)}(?:/.*)?/?`);
  return `^(?:${patterns.join('|')})$`;
}

function iniText(sections) {
  return sections
    .map(
      ([name, options]) =>
        `[${name}]\n${Object.entries(options)
          .map(([key, value]) => `${key} = ${String(value).replaceAll('\n', '\n    ')}\n`)
          .join('')}`,
    )
    .join('\n');
}

export function mypyConfigText(model, { projectRoot, exclude }) {
  const options = {
    ...pick(model.options, GLOBAL_OPTIONS, projectRoot),
    ...(exclude.length === 0 ? {} : { exclude: excludePattern(exclude) }),
  };
  const modules = model.modules
    .map(({ patterns, options: moduleOptions }) => ({
      patterns,
      options: pick(moduleOptions, MODULE_OPTIONS, projectRoot),
    }))
    .filter(({ options: kept }) => Object.keys(kept).length > 0);
  if (model.format === 'toml') {
    return toml().stringify({
      tool: {
        ...model.others,
        mypy: {
          ...options,
          ...(modules.length === 0
            ? {}
            : {
                overrides: modules.map(({ patterns, options: kept }) => ({
                  module: patterns,
                  ...kept,
                })),
              }),
        },
      },
    });
  }
  return iniText([
    ['mypy', options],
    ...modules.map(({ patterns, options: kept }) => [
      `${MODULE_PREFIX}${patterns.join(',')}`,
      kept,
    ]),
    ...model.others.map(([name, section]) => [name, Object.fromEntries(section)]),
  ]);
}

export function writeMypyConfig({ projectRoot, reportRoot, exclude }) {
  const model = readMypyConfig(projectRoot);
  const file = path.join(reportRoot, model?.format === 'toml' ? 'pyproject.toml' : MYPY_CONFIG);
  writeFileSync(
    file,
    mypyConfigText(model ?? { format: 'ini', options: {}, modules: [], others: [] }, {
      projectRoot,
      exclude,
    }),
  );
  return file;
}
