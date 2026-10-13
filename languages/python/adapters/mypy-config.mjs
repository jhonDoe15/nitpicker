import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { globToRegExpSource } from '../../../shared/glob.mjs';

const MYPY_CONFIG = 'mypy.ini';
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

function startSection(name, sections, state) {
  state.options = new Map();
  state.key = undefined;
  sections.set(name.trim(), state.options);
}

function appendValue(content, state) {
  state.options.set(state.key, `${state.options.get(state.key)}\n${content}`);
}

function startOption(line, state) {
  const option = INI_OPTION.exec(line);
  if (option === null || state.options === undefined) {
    return;
  }
  state.key = option[1].trim();
  state.options.set(state.key, option[2].trim());
}

function readIniLine(line, sections, state) {
  const content = line.trim();
  const indented = /^\s/.test(line);
  const section = indented ? null : INI_SECTION.exec(content);
  if (content === '' || /^[#;]/.test(content)) {
    state.key = undefined;
  } else if (section !== null) {
    startSection(section[1], sections, state);
  } else if (indented && state.key !== undefined) {
    appendValue(content, state);
  } else {
    startOption(line, state);
  }
}

function parseIni(text) {
  const sections = new Map();
  const state = { options: undefined, key: undefined };
  for (const raw of text.split(/\r?\n/)) {
    readIniLine(raw.replace(INI_COMMENT, ''), sections, state);
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

function expandDirectory(text, projectRoot) {
  return text.replace(CONFIG_DIRECTORY_VARIABLE, projectRoot);
}

function expandValue(value, projectRoot) {
  if (Array.isArray(value)) {
    return value.map((entry) => expandDirectory(entry, projectRoot));
  }
  return typeof value === 'string' ? expandDirectory(value, projectRoot) : value;
}

function pluginValue(value, projectRoot) {
  const entries = (Array.isArray(value) ? value : value.split(','))
    .map((entry) => pluginEntry(expandDirectory(entry.trim(), projectRoot), projectRoot))
    .filter((entry) => entry !== '');
  return Array.isArray(value) ? entries : entries.join(', ');
}

function environmentValue(key, value, projectRoot) {
  return key === 'plugins' ? pluginValue(value, projectRoot) : expandValue(value, projectRoot);
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

function mypyConfigText(model, { projectRoot, exclude }) {
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
