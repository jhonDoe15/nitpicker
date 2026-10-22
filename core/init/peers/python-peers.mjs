import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readProjectHints } from '../../../languages/python/adapters/execution/python-project.mjs';

const MUTMUT = 'mutmut>=3,<4';
const RUNNER_PEERS = {
  pytest: [],
  unittest: [],
  django: ['pytest-django'],
  nose2: ['nose2'],
};

export function requiredPythonPeers({ testRunner, typeChecker }) {
  return ['coverage', typeChecker, 'pytest', ...RUNNER_PEERS[testRunner], MUTMUT];
}

function distributionName(requirement) {
  return /^[A-Za-z0-9_.-]+/u.exec(requirement)[0];
}

function namePattern(name) {
  return name.replaceAll(/[-_.]+/gu, '[-_.]');
}

function isDeclared(hints, name) {
  return new RegExp(String.raw`(?:^|[\s"'=,\[(])${namePattern(name)}(?![\w.-])`, 'imu').test(hints);
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

export function missingPythonPeers(projectRoot, python) {
  const hints = readProjectHints(projectRoot);
  const installed = installedEntries(projectRoot);
  return requiredPythonPeers(python).filter((requirement) => {
    const name = distributionName(requirement);
    return !isDeclared(hints, name) && !isInstalled(installed, name);
  });
}
