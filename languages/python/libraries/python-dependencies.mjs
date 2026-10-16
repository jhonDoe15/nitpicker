import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const REQUIREMENT_NAME = /^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)/u;
const EGG_NAME = /[#&]egg=([A-Za-z0-9][A-Za-z0-9._-]*)/u;
const REQUIREMENT_FILE = /^requirements.*\.(?:txt|in)$|^.*-requirements\.(?:txt|in)$/u;
const REQUIREMENT_DIRECTORY = 'requirements';
const DEVELOPMENT_GROUP =
  /(?:^|[-_.])(?:dev|devel|develop|development|test|tests|testing|lint|linting|docs?|typing|types|ci|qa|check|checks|style|tox|coverage)(?:$|[-_.])/iu;
const INI_SECTION = /^\[([^\]]+)\]\s*$/u;
const INI_OPTION = /^([^\s=:][^=:]*?)\s*[=:]\s*(.*)$/u;

export function normalizeRequirementName(name) {
  return name.toLowerCase().replaceAll(/[-_.]+/gu, '-');
}

export function isDevelopmentGroup(name) {
  return DEVELOPMENT_GROUP.test(name);
}

export function requirementName(line) {
  const text = line.replace(/\s+#.*$/u, '').trim();
  if (text === '' || text.startsWith('#')) {
    return undefined;
  }
  if (text.startsWith('-')) {
    return text.startsWith('-e') ? requirementName(text.slice(2).trim()) : undefined;
  }
  const egg = EGG_NAME.exec(text);
  if (egg !== null) {
    return normalizeRequirementName(egg[1]);
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(text) || text.startsWith('.') || text.startsWith('/')) {
    return undefined;
  }
  const match = REQUIREMENT_NAME.exec(text);
  return match === null ? undefined : normalizeRequirementName(match[1]);
}

function namesOf(requirements) {
  return (Array.isArray(requirements) ? requirements : [])
    .filter((entry) => typeof entry === 'string')
    .map(requirementName)
    .filter((name) => name !== undefined);
}

function keysOf(table) {
  return table === null || typeof table !== 'object' || Array.isArray(table)
    ? []
    : Object.keys(table)
        .filter((name) => name.toLowerCase() !== 'python')
        .map(normalizeRequirementName);
}

function groupsOf(groups, classify) {
  return Object.entries(groups ?? {}).map(([group, value]) => ({
    kind: classify(group),
    names: namesOf(value),
  }));
}

function groupKind(group) {
  return isDevelopmentGroup(group) ? 'development' : 'runtime';
}

function poetryGroups(poetry) {
  return Object.entries(poetry?.group ?? {}).map(([group, value]) => ({
    kind: group === 'main' ? 'runtime' : 'development',
    names: keysOf(value?.dependencies),
  }));
}

function projectTables(parsed) {
  const { project, tool } = parsed;
  const pdm = Object.values(tool?.pdm?.['dev-dependencies'] ?? {}).flatMap(namesOf);
  return [
    { kind: 'runtime', names: namesOf(project?.dependencies) },
    ...groupsOf(project?.['optional-dependencies'], groupKind),
    ...groupsOf(parsed['dependency-groups'], () => 'development'),
    { kind: 'runtime', names: keysOf(tool?.poetry?.dependencies) },
    ...poetryGroups(tool?.poetry),
    { kind: 'development', names: keysOf(tool?.poetry?.['dev-dependencies']) },
    { kind: 'development', names: namesOf(tool?.uv?.['dev-dependencies']) },
    { kind: 'development', names: pdm },
  ];
}

function parseToml(file) {
  try {
    return createRequire(import.meta.url)('smol-toml').parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function pyprojectGroups(projectRoot) {
  const file = path.join(projectRoot, 'pyproject.toml');
  return existsSync(file) ? projectTables(parseToml(file)) : [];
}

function pipfileGroups(projectRoot) {
  const file = path.join(projectRoot, 'Pipfile');
  if (!existsSync(file)) {
    return [];
  }
  const parsed = parseToml(file);
  return [
    { kind: 'runtime', names: keysOf(parsed.packages) },
    { kind: 'development', names: keysOf(parsed['dev-packages']) },
  ];
}

function requirementFiles(projectRoot) {
  const directory = path.join(projectRoot, REQUIREMENT_DIRECTORY);
  const nested =
    existsSync(directory) && statSync(directory).isDirectory()
      ? readdirSync(directory)
          .filter((name) => /\.(?:txt|in)$/u.test(name))
          .map((name) => path.join(REQUIREMENT_DIRECTORY, name))
      : [];
  return [
    ...readdirSync(projectRoot)
      .filter((name) => REQUIREMENT_FILE.test(name))
      .sort(),
    ...nested.sort(),
  ];
}

function requirementGroups(projectRoot) {
  return requirementFiles(projectRoot)
    .filter((name) => statSync(path.join(projectRoot, name)).isFile())
    .map((name) => ({
      kind: groupKind(path.basename(name, path.extname(name))),
      names: readFileSync(path.join(projectRoot, name), 'utf8')
        .split(/\r?\n/u)
        .map(requirementName)
        .filter((entry) => entry !== undefined),
    }));
}

function readIniLine(line, sections, state) {
  const trimmed = line.trim();
  const indented = /^\s/u.test(line);
  const header = indented ? null : INI_SECTION.exec(trimmed);
  if (trimmed === '' || /^[#;]/u.test(trimmed)) {
    state.key = undefined;
  } else if (header !== null) {
    state.options = new Map();
    state.key = undefined;
    sections.set(header[1].trim(), state.options);
  } else if (indented && state.key !== undefined) {
    state.options.set(state.key, `${state.options.get(state.key)}\n${trimmed}`);
  } else if (state.options !== undefined && INI_OPTION.test(trimmed)) {
    const [, key, value] = INI_OPTION.exec(trimmed);
    state.key = key.trim();
    state.options.set(state.key, value.trim());
  }
}

function parseIni(text) {
  const sections = new Map();
  const state = { options: undefined, key: undefined };
  for (const line of text.split(/\r?\n/u)) {
    readIniLine(line, sections, state);
  }
  return sections;
}

function setupCfgGroups(projectRoot) {
  const file = path.join(projectRoot, 'setup.cfg');
  if (!existsSync(file)) {
    return [];
  }
  const sections = parseIni(readFileSync(file, 'utf8'));
  const options = sections.get('options') ?? new Map();
  const extras = sections.get('options.extras_require') ?? new Map();
  const lines = (text) => (text ?? '').split('\n');
  return [
    { kind: 'runtime', names: namesOf(lines(options.get('install_requires'))) },
    { kind: 'development', names: namesOf(lines(options.get('tests_require'))) },
    ...[...extras].map(([group, text]) => ({
      kind: groupKind(group),
      names: namesOf(lines(text)),
    })),
  ];
}

export function readPythonDependencies(projectRoot) {
  const groups = [
    ...pyprojectGroups(projectRoot),
    ...pipfileGroups(projectRoot),
    ...requirementGroups(projectRoot),
    ...setupCfgGroups(projectRoot),
  ];
  const named = (kind) => [
    ...new Set(groups.filter((group) => group.kind === kind).flatMap(({ names }) => names)),
  ];
  const runtime = named('runtime');
  return {
    runtime,
    development: named('development').filter((name) => !runtime.includes(name)),
  };
}
