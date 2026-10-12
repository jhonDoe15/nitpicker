import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const FORMATTER_HINT_FILES = [
  'pyproject.toml',
  'ruff.toml',
  '.ruff.toml',
  'requirements.txt',
  'requirements-dev.txt',
  'dev-requirements.txt',
  '.pre-commit-config.yaml',
  'setup.cfg',
  'tox.ini',
];
const TYPE_HINT_FILES = [...FORMATTER_HINT_FILES, 'mypy.ini', '.mypy.ini', 'pyrightconfig.json'];
const TYPE_CHECKER_HINTS = {
  mypy: {
    configured: /^\s*\[{1,2}(?:tool\.)?mypy[\].-]/m,
    configFiles: ['mypy.ini', '.mypy.ini'],
    declared: /^\s*["']?mypy(?![\w-])|mirrors-mypy/m,
  },
  pyright: {
    configured: /^\s*\[tool\.pyright\]/m,
    configFiles: ['pyrightconfig.json'],
    declared: /^\s*["']?pyright(?![\w-])|pyright-python/m,
  },
};
const CONFIGURED_WEIGHT = 2;
const BLACK_HINT = /^\s*\[tool\.black\]|^\s*["']?black(?![\w-])|psf\/black(?![\w-])/m;
const RUFF_FORMAT_HINT = /^\s*\[tool\.ruff\.format\]|ruff-format|^\s*\[format\]/m;
const NON_SOURCE_DIRECTORIES = new Set([
  'tests',
  'test',
  'docs',
  'doc',
  'examples',
  'scripts',
  'build',
  'dist',
  'venv',
  'node_modules',
  'site-packages',
]);

export function detectFormatter(projectRoot, setting) {
  if (setting !== undefined) {
    return setting;
  }
  const hints = FORMATTER_HINT_FILES.filter((file) => existsSync(path.join(projectRoot, file)))
    .map((file) => readFileSync(path.join(projectRoot, file), 'utf8'))
    .join('\n');
  return BLACK_HINT.test(hints) && !RUFF_FORMAT_HINT.test(hints) ? 'black' : 'ruff';
}

export function detectTypeChecker(projectRoot, setting) {
  if (setting !== undefined) {
    return setting;
  }
  const texts = TYPE_HINT_FILES.filter((file) => existsSync(path.join(projectRoot, file))).map(
    (file) => [file, readFileSync(path.join(projectRoot, file), 'utf8')],
  );
  const scores = Object.entries(TYPE_CHECKER_HINTS).map(([checker, hints]) => [
    checker,
    typeCheckerScore(texts, hints),
  ]);
  const best = Math.max(...scores.map(([, score]) => score));
  return best === 0 ? undefined : scores.find(([, score]) => score === best)[0];
}

function typeCheckerScore(texts, { configured, configFiles, declared }) {
  const hasConfig = texts.some(
    ([file, text]) => configFiles.includes(file) || configured.test(text),
  );
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

function isDirectory(directory) {
  return existsSync(directory) && statSync(directory).isDirectory();
}
