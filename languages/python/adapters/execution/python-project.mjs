import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const INI_SECTION = /^\[([^\]]+)\]\s*$/;
const INI_SEPARATOR = /[=:]/;
const INI_COMMENT = /\s+[#;].*$/;
const HINT_FILES = [
  'pyproject.toml',
  'ruff.toml',
  '.ruff.toml',
  'setup.cfg',
  'tox.ini',
  'pytest.ini',
  'Pipfile',
  '.pre-commit-config.yaml',
];
const REQUIREMENT_DIRECTORY = 'requirements';
const REQUIREMENT_FILE = /requirements.*\.(?:txt|in)$/;
const BLACK_HINT = new RegExp(
  [
    String.raw`^\s*\[tool\.black\]`,
    String.raw`^\s*(?:commands\s*=\s*)?black(?![\w.-])`,
    String.raw`["']black(?![\w.-])`,
    String.raw`psf/black(?:-pre-commit-mirror)?(?![\w-])`,
    String.raw`id:\s*black(?:-jupyter)?\s*$`,
  ].join('|'),
  'm',
);
const TYPE_CONFIG_FILES = ['mypy.ini', '.mypy.ini', 'pyrightconfig.json'];
const TYPE_CHECKER_HINTS = {
  mypy: {
    configured: /^\s*\[{1,2}\s*(?:tool\.)?mypy[\].\s-]/m,
    configFiles: ['mypy.ini', '.mypy.ini'],
    declared: /(?:^\s*|["'])mypy(?![\w.-])|mirrors-mypy/m,
  },
  pyright: {
    configured: /^\s*\[\s*tool\.pyright\s*\]/m,
    configFiles: ['pyrightconfig.json'],
    declared: /(?:^\s*|["'])pyright(?![\w.-])|pyright-python/m,
  },
  basedpyright: {
    configured: /^\s*\[\s*tool\.basedpyright\s*\]/m,
    configFiles: [],
    declared: /(?:^\s*|["'])basedpyright(?![\w.-])|basedpyright-pre-commit/m,
  },
};
const CONFIGURED_WEIGHT = 2;
const RUFF_FORMAT_HINT = /^\s*\[tool\.ruff\.format\]|ruff-format|^\s*\[format\]/m;
const MINIMUM_MINOR = 8;
const LOWER_BOUND = /^(>=|~=|==|\^|~|>)?\s*v?3\.(\d+)/;
const REQUIRES_PYTHON = [
  /^\s*requires-python\s*=\s*["']([^"']+)["']/m,
  /^\s*python_requires\s*=\s*(.+)$/m,
  /^\s*python\s*=\s*["']([^"']+)["']/m,
];
export const INSTALLED_DIRECTORIES = ['__pycache__', 'node_modules', 'site-packages'];
export const DOCUMENTATION_DIRECTORIES = ['docs', 'doc', 'examples', 'scripts'];
export const NON_SOURCE_DIRECTORIES = new Set([
  'tests',
  'test',
  ...DOCUMENTATION_DIRECTORIES,
  'build',
  'dist',
  'env',
  'venv',
  ...INSTALLED_DIRECTORIES,
]);
export const NON_SOURCE_FILES = new Set(['conftest.py']);

export function readFileEntries(projectRoot, names) {
  return names
    .filter((name) => isFile(path.join(projectRoot, name)))
    .map((name) => [name, readFileSync(path.join(projectRoot, name), 'utf8')]);
}

function readFiles(projectRoot, names) {
  return readFileEntries(projectRoot, names).map(([, text]) => text);
}

function requirementsInDirectory(projectRoot) {
  const directory = path.join(projectRoot, REQUIREMENT_DIRECTORY);
  return isDirectory(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith('.txt') || name.endsWith('.in'))
        .map((name) => path.posix.join(REQUIREMENT_DIRECTORY, name))
    : [];
}

function requirementFiles(projectRoot) {
  return [
    ...readdirSync(projectRoot).filter((name) => REQUIREMENT_FILE.test(name)),
    ...requirementsInDirectory(projectRoot),
  ];
}

export function readProjectHints(projectRoot) {
  return readFiles(projectRoot, [...HINT_FILES, ...requirementFiles(projectRoot)]).join('\n');
}

export function detectFormatter(projectRoot, setting) {
  if (setting !== undefined) {
    return setting;
  }
  const hints = readProjectHints(projectRoot);
  return BLACK_HINT.test(hints) && !RUFF_FORMAT_HINT.test(hints) ? 'black' : 'ruff';
}

function lowestMinor(specifier) {
  const alternatives = specifier.split('||').flatMap((alternative) => {
    const bounds = alternative.split(',').flatMap((clause) => {
      const bound = LOWER_BOUND.exec(clause.trim());
      return bound === null ? [] : [Number(bound[2]) + (bound[1] === '>' ? 1 : 0)];
    });
    return bounds.length === 0 ? [] : [Math.max(...bounds)];
  });
  return alternatives.length === 0
    ? MINIMUM_MINOR
    : Math.max(MINIMUM_MINOR, Math.min(...alternatives));
}

export function detectTargetVersion(projectRoot) {
  const hints = readFiles(projectRoot, ['pyproject.toml', 'setup.cfg']).join('\n');
  const specifier = REQUIRES_PYTHON.map((pattern) => pattern.exec(hints)?.[1]).find(
    (found) => found !== undefined,
  );
  return `py3${String(lowestMinor(specifier ?? ''))}`;
}

export function detectTypeCheckers(projectRoot, setting) {
  if (setting !== undefined) {
    return [setting];
  }
  const texts = readFileEntries(projectRoot, [
    ...HINT_FILES,
    ...requirementFiles(projectRoot),
    ...TYPE_CONFIG_FILES,
  ]);
  const basedpyright = typeCheckerScore(texts, TYPE_CHECKER_HINTS.basedpyright);
  const scores = Object.entries(TYPE_CHECKER_HINTS).map(([checker, hints]) => [
    checker,
    typeCheckerScore(texts, hints, checker === 'pyright' && basedpyright > 0),
  ]);
  const best = Math.max(...scores.map(([, score]) => score));
  return best === 0 ? [] : scores.filter(([, score]) => score === best).map(([checker]) => checker);
}

function typeCheckerScore(texts, { configured, configFiles, declared }, sharesConfig = false) {
  const hasConfig =
    !sharesConfig &&
    texts.some(([file, text]) => configFiles.includes(file) || configured.test(text));
  const isDeclared = texts.some(([, text]) => declared.test(text));
  return (hasConfig ? CONFIGURED_WEIGHT : 0) + (isDeclared ? 1 : 0);
}

export function detectSourceRoots(projectRoot, setting) {
  if (setting !== undefined) {
    return setting.map((root) =>
      path.posix.normalize(root.replaceAll('\\', '/')).replace(/(.)\/+$/, '$1'),
    );
  }
  if (isDirectory(path.join(projectRoot, 'src'))) {
    return ['src'];
  }
  const packages = readdirSync(projectRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !NON_SOURCE_DIRECTORIES.has(entry.name) &&
        existsSync(path.join(projectRoot, entry.name, '__init__.py')),
    )
    .map((entry) => entry.name)
    .sort();
  return packages.length > 0 ? packages : ['.'];
}

export function importRoots(projectRoot, sourceRoots) {
  const roots = sourceRoots.map((root) => {
    const absolute = path.resolve(projectRoot, root);
    return existsSync(path.join(absolute, '__init__.py')) ? path.dirname(absolute) : absolute;
  });
  return [...new Set(roots)];
}

export function readOptional(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function isFile(file) {
  return existsSync(file) && statSync(file).isFile();
}

function isDirectory(directory) {
  return existsSync(directory) && statSync(directory).isDirectory();
}

export function toml() {
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
  const separator = line.search(INI_SEPARATOR);
  if (separator <= 0 || isIndented(line) || state.options === undefined) {
    return;
  }
  state.key = line.slice(0, separator).trim();
  state.options.set(state.key, line.slice(separator + 1).trim());
}

function isIndented(line) {
  return /^\s/.test(line);
}

function sectionName(line) {
  return isIndented(line) ? undefined : INI_SECTION.exec(line.trim())?.[1];
}

function readIniLine(line, sections, state) {
  const content = line.trim();
  const name = sectionName(line);
  if (content === '' || /^[#;]/.test(content)) {
    return;
  }
  if (name !== undefined) {
    startSection(name, sections, state);
    return;
  }
  if (isIndented(line) && state.key !== undefined) {
    appendValue(content, state);
    return;
  }
  startOption(line, state);
}

export function parseIni(text) {
  const sections = new Map();
  const state = { options: undefined, key: undefined };
  for (const raw of text.split(/\r?\n/)) {
    readIniLine(raw.replace(INI_COMMENT, ''), sections, state);
  }
  return sections;
}
