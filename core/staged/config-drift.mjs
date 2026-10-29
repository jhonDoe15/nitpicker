import path from 'node:path';
import { runGit } from '../diff/git/repository/command.mjs';

const CONFIG_FILE_NAMES = new Set([
  'nitpicker.config.json',
  'package.json',
  'tsconfig.json',
  'jsconfig.json',
  '.editorconfig',
  'pyproject.toml',
  'setup.cfg',
  'ruff.toml',
  '.ruff.toml',
  'mypy.ini',
  'pyrightconfig.json',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'pom.xml',
  'detekt.yml',
  '.prettierrc',
]);

const CONFIG_FILE_PATTERNS = [
  /^tsconfig\..+\.json$/u,
  /^eslint\.config\.[cm]?[jt]s$/u,
  /^\.prettierrc\..+$/u,
  /^prettier\.config\.[cm]?js$/u,
  /^vitest\.config\.[cm]?[jt]s$/u,
];

function isConfigFile(file) {
  const name = path.posix.basename(file);
  return CONFIG_FILE_NAMES.has(name) || CONFIG_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

function listed(output) {
  return output.split('\0').filter((file) => file !== '');
}

export function stagedConfigDrift(repositoryRoot, indexFile) {
  const environment =
    indexFile === undefined
      ? undefined
      : { GIT_INDEX_FILE: path.resolve(repositoryRoot, indexFile) };
  const changed = [
    ...listed(runGit(repositoryRoot, ['diff', '--name-only', '-z'], { environment })),
    ...listed(
      runGit(repositoryRoot, ['ls-files', '--others', '--exclude-standard', '-z'], {
        environment,
      }),
    ),
  ];
  return [...new Set(changed.filter(isConfigFile))].sort();
}

export function stagedConfigNotice(files) {
  if (files.length === 0) {
    return '';
  }
  return [
    'nitpicker: --staged judges the index but reads the config from the working tree,',
    ` and these files differ from the index: ${files.join(', ')}.`,
    ' Stage them, or run nitpicker without --staged.\n',
  ].join('');
}
