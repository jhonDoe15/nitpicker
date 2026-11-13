import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  readFileEntries,
  requirementFiles,
} from '../../../languages/python/adapters/execution/python-project.mjs';
import { escapeRegExp } from '../../../shared/paths/glob.mjs';
import { textOf } from '../../../shared/values/readers.mts';

type PythonTools = { readonly testRunner?: string; readonly typeChecker?: string };

const entriesOf: (projectRoot: string, files: readonly string[]) => (readonly [string, string])[] =
  readFileEntries;
const requirementFilesOf: (projectRoot: string) => string[] = requirementFiles;

const escaped: (value: string) => string = escapeRegExp;

const MUTMUT = 'mutmut>=3,<4';
const RUNNER_PEERS: Readonly<Record<string, readonly string[]>> = {
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
type PeerStatus = {
  readonly requirement: string;
  readonly declared: boolean;
  readonly installed: boolean;
};

const SECTION_HEADER = /^[ \t]*\[{1,2}[\w.:\- ]+\]{1,2}[ \t]*$/gmu;

export function requiredPythonPeers({ testRunner, typeChecker }: PythonTools): string[] {
  return [
    'coverage',
    textOf(typeChecker),
    'pytest',
    ...(RUNNER_PEERS[textOf(testRunner)] ?? []),
    MUTMUT,
  ];
}

function distributionName(requirement: string): string {
  return /^[A-Za-z0-9_.-]+/u.exec(requirement)?.[0] ?? '';
}

function namePattern(name: string): RegExp {
  const parts = name.split(/[-_.]+/u).map((part) => escaped(part));
  return new RegExp(parts.join('[-_.]'), 'u');
}

function declarations(projectRoot: string): string {
  const files = [...DEPENDENCY_FILES, ...requirementFilesOf(projectRoot)];
  return entriesOf(projectRoot, files)
    .map(([, text]) => text.replaceAll(SECTION_HEADER, ''))
    .join('\n');
}

function isDeclared(declared: string, name: string): boolean {
  return new RegExp(String.raw`(?:^|[\s"'=,\[(])${namePattern(name).source}(?![\w.-])`, 'imu').test(
    declared,
  );
}

function sitePackageDirectories(venv: string): string[] {
  const posixLibrary = path.join(venv, 'lib');
  const versioned = existsSync(posixLibrary)
    ? readdirSync(posixLibrary).map((folder) => path.join(posixLibrary, folder, 'site-packages'))
    : [];
  return [...versioned, path.join(venv, 'Lib', 'site-packages')].filter((directory) =>
    existsSync(directory),
  );
}

function installedEntries(projectRoot: string): string[] {
  return sitePackageDirectories(path.join(projectRoot, '.venv')).flatMap((directory) =>
    readdirSync(directory),
  );
}

function isInstalled(entries: readonly string[], name: string): boolean {
  const entry = new RegExp(String.raw`^${namePattern(name).source}(?:[-_.]|$)`, 'iu');
  return entries.some((candidate) => entry.test(candidate));
}

export function pythonPeerStatus(projectRoot: string, python: PythonTools): PeerStatus[] {
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
