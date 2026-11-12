import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  readFileEntries,
  requirementFiles,
} from '../../../languages/python/adapters/execution/python-project.mjs';

const MUTMUT = 'mutmut>=3,<4';
const RUNNER_PEERS = {
  pytest: [],
  unittest: [],
  django: ['pytest-django'],
  nose2: ['nose2'],
};
const DEPENDENCY_FILES = [
  'pyproject.toml',
  'setup.cfg',
  'setup.py',
  'Pipfile',
  'hatch.toml',
  'environment.yml',
  'environment.yaml',
];
const SECTION_HEADER = /^[ \t]*\[{1,2}[\w.:\- ]+\]{1,2}[ \t]*$/gmu;

export function requiredPythonPeers({ testRunner, typeChecker }) {
  return ['coverage', typeChecker, 'pytest', ...RUNNER_PEERS[testRunner], MUTMUT];
}

function distributionName(requirement) {
  return /^[A-Za-z0-9_.-]+/u.exec(requirement)[0];
}

function namePattern(name) {
  return name.replaceAll(/[-_.]+/gu, '[-_.]');
}

function declarations(projectRoot) {
  const files = [...DEPENDENCY_FILES, ...requirementFiles(projectRoot)];
  return readFileEntries(projectRoot, files)
    .map(([, text]) => text.replaceAll(SECTION_HEADER, ''))
    .join('\n');
}

function isDeclared(declared, name) {
  return new RegExp(String.raw`(?:^|[\s"'=,\[(])${namePattern(name)}(?![\w.-])`, 'imu').test(
    declared,
  );
}

function sitePackageDirectories(venv) {
  const posixLibrary = path.join(venv, 'lib');
  const versioned = existsSync(posixLibrary)
    ? readdirSync(posixLibrary).map((folder) => path.join(posixLibrary, folder, 'site-packages'))
    : [];
  return [...versioned, path.join(venv, 'Lib', 'site-packages')].filter((directory) =>
    existsSync(directory),
  );
}

function installedEntries(projectRoot) {
  return sitePackageDirectories(path.join(projectRoot, '.venv')).flatMap((directory) =>
    readdirSync(directory),
  );
}

function isInstalled(entries, name) {
  const entry = new RegExp(String.raw`^${namePattern(name)}(?:[-_.]|$)`, 'iu');
  return entries.some((candidate) => entry.test(candidate));
}

export function pythonPeerStatus(projectRoot, python) {
  const declared = declarations(projectRoot);
  const installed = installedEntries(projectRoot);
  return requiredPythonPeers(python).map((requirement) => {
    const name = distributionName(requirement);
    return {
      requirement,
      declared: isDeclared(declared, name),
      installed: isInstalled(installed, name),
    };
  });
}
