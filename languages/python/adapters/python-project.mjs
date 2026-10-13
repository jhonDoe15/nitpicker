import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

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
const RUFF_FORMAT_HINT = /^\s*\[tool\.ruff\.format\]|ruff-format|^\s*\[format\]/m;
const MINIMUM_MINOR = 8;
const LOWER_BOUND = /^(>=|~=|==|\^|~|>)?\s*v?3\.(\d+)/;
const REQUIRES_PYTHON = [
  /^\s*requires-python\s*=\s*["']([^"']+)["']/m,
  /^\s*python_requires\s*=\s*(.+)$/m,
  /^\s*python\s*=\s*["']([^"']+)["']/m,
];
export const INSTALLED_DIRECTORIES = ['__pycache__', 'node_modules', 'site-packages'];
export const NON_SOURCE_DIRECTORIES = new Set([
  'tests',
  'test',
  'docs',
  'doc',
  'examples',
  'scripts',
  'build',
  'dist',
  'env',
  'venv',
  ...INSTALLED_DIRECTORIES,
]);
export const NON_SOURCE_FILES = new Set(['conftest.py']);

function readFiles(projectRoot, names) {
  return names
    .filter((name) => isFile(path.join(projectRoot, name)))
    .map((name) => readFileSync(path.join(projectRoot, name), 'utf8'));
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

function isFile(file) {
  return existsSync(file) && statSync(file).isFile();
}

function isDirectory(directory) {
  return existsSync(directory) && statSync(directory).isDirectory();
}
