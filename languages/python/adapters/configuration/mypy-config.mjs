import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseIni } from './ini-parser.mjs';
import { missingProjectConfig } from '../../../../shared/conventions/tool-precedence.mjs';
import { globToRegExpSource } from '../../../../shared/glob.mjs';
import {
  isOwnModulePattern,
  MYPY_LOOKED,
  MYPY_TOOL,
  mypyLayers,
  mypyOwnModules,
} from '../project-tools/mypy-layers.mjs';
import { attempt } from '../project-tools/project-tool-layers.mjs';

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

function isDedicatedFile(name) {
  return INI_FILES.includes(name);
}

function toml() {
  return createRequire(import.meta.url)('smol-toml');
}

function iniModel(sections, shared) {
  if (shared && !sections.has('mypy')) {
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
    options: Object.fromEntries(sections.get('mypy') ?? []),
    modules,
    others,
  };
}

function tomlModel(text, name) {
  const { value: parsed, error } = attempt(() => toml().parse(text));
  if (error !== undefined) {
    throw new Error(`${name} could not be parsed (${error.message}): fix it`);
  }
  const { tool = {} } = parsed;
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
  const model = name.endsWith('.toml')
    ? tomlModel(text, name)
    : iniModel(parseIni(text), !isDedicatedFile(name));
  return model === undefined ? undefined : { ...model, file: name };
}

export function readMypyConfig(projectRoot) {
  for (const name of [...INI_FILES, 'pyproject.toml', 'setup.cfg']) {
    const model = readCandidate(projectRoot, name);
    if (model !== undefined) {
      return model;
    }
  }
  return undefined;
}

export function mypyExcludeArguments(context) {
  return mypyLayers(context).appliesProject && context.exclude.length > 0
    ? ['--exclude', excludePattern(context.exclude)]
    : [];
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

export function excludePattern(exclude) {
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

function excludeOption(exclude) {
  return exclude.length === 0 ? {} : { exclude: excludePattern(exclude) };
}

function pickAll(options, projectRoot) {
  return Object.fromEntries(
    Object.entries(options).map(([key, value]) => [key, environmentValue(key, value, projectRoot)]),
  );
}

function isolatedSections(model, { projectRoot, exclude, own }) {
  return {
    options: { ...pick(model.options, GLOBAL_OPTIONS, projectRoot), ...excludeOption(exclude) },
    modules: model.modules
      .map(({ patterns, options }) => ({
        patterns: patterns.filter((pattern) => !isOwnModulePattern(pattern, own)),
        options: pick(options, MODULE_OPTIONS, projectRoot),
      }))
      .filter(({ patterns, options }) => patterns.length > 0 && Object.keys(options).length > 0),
  };
}

function layeredSections(model, { projectRoot }) {
  const { exclude: projectExclude, ...rest } = model.options;
  return {
    options: {
      strict: true,
      ...pickAll(rest, projectRoot),
      ...(projectExclude === undefined ? {} : { exclude: projectExclude }),
    },
    modules: model.modules.map(({ patterns, options }) => ({
      patterns,
      options: pickAll(options, projectRoot),
    })),
  };
}

function mypyConfigText(model, settings) {
  const { options, modules } = settings.appliesProject
    ? layeredSections(model, settings)
    : isolatedSections(model, settings);
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

export function writeMypyConfig(context) {
  const { projectRoot, reportRoot, exclude } = context;
  const layers = mypyLayers(context);
  const model = readMypyConfig(layers.configRoot);
  if (layers.optedIn && model === undefined) {
    throw new Error(
      missingProjectConfig(MYPY_TOOL, `${MYPY_LOOKED} (searched ${layers.configRoot})`),
    );
  }
  const file = path.join(reportRoot, model?.format === 'toml' ? 'pyproject.toml' : MYPY_CONFIG);
  writeFileSync(
    file,
    mypyConfigText(model ?? { format: 'ini', options: {}, modules: [], others: [] }, {
      projectRoot,
      exclude,
      appliesProject: layers.appliesProject,
      own: layers.appliesProject ? new Set() : mypyOwnModules(context, model),
    }),
  );
  return file;
}
