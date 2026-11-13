import { readFileSync } from 'node:fs';
import { hasProjectFile, insideProject } from '../../support/inside-project.mts';
import { MINIMUM_PYTHON } from '../../../../languages/python/ingest/rules-report.mjs';
import { type StepSettings, repositoryPath } from './yaml-steps.mts';

type VersionChoice = { readonly settings: StepSettings; readonly notes: readonly string[] };

const minimumPython: string = MINIMUM_PYTHON;

const PYTHON_VERSION = '3.13';
const REQUIRES_PYTHON = /^\s*requires-python\s*=\s*["'](?<spec>[^"']+)["']/mu;
const POETRY_PYTHON = /^\s*python\s*=\s*["'](?<spec>[^"']+)["']/mu;
const LOWER_BOUND = /(?:>=|~=|==|\^|~)\s*(?<version>\d+\.\d+)/u;
const UPPER_BOUND = /<(?<inclusive>=?)\s*(?<version>\d+\.\d+)/u;
const PINNED = /(?<![<>!=~])==|~(?!=)/u;
const PINNED_VERSION = /^\s*(?<version>\d+\.\d+)/mu;
const FLOOR_CHECKS = 'the python-rules, mutmut and dependency checks';

function isOlder(version: string, than: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  const [thanMajor, thanMinor] = than.split('.').map(Number);
  return major === thanMajor ? (minor ?? 0) < (thanMinor ?? 0) : (major ?? 0) < (thanMajor ?? 0);
}

function allowsFloor(spec: string): boolean {
  const upper = UPPER_BOUND.exec(spec)?.groups;
  if (PINNED.test(spec)) {
    return false;
  }
  if (upper === undefined) {
    return true;
  }
  const version = upper['version'] ?? '';
  return upper['inclusive'] === '='
    ? !isOlder(version, minimumPython)
    : isOlder(minimumPython, version);
}

function pinnedVersionFile(root: string, repository: string): VersionChoice {
  const file = insideProject(root, '.python-version');
  const pinned = PINNED_VERSION.exec(readFileSync(file, 'utf8'))?.groups?.['version'];
  const notes =
    pinned !== undefined && isOlder(pinned, minimumPython)
      ? [
          `.python-version asks for Python ${pinned}, and ${FLOOR_CHECKS} need Python ${minimumPython} or newer, so in CI they report that they were skipped. Raise .python-version to ${minimumPython} or newer to run them.`,
        ]
      : [];
  return { settings: { 'python-version-file': repositoryPath(repository, file) }, notes };
}

function boundedVersion(spec: string): VersionChoice {
  const lower = LOWER_BOUND.exec(spec)?.groups?.['version'];
  if (lower === undefined) {
    return { settings: { 'python-version': PYTHON_VERSION }, notes: [] };
  }
  if (!isOlder(lower, minimumPython)) {
    return { settings: { 'python-version': lower }, notes: [] };
  }
  const reason = `pyproject.toml allows Python ${lower} ("${spec}"), and ${FLOOR_CHECKS} need Python ${minimumPython} or newer`;
  return allowsFloor(spec)
    ? {
        settings: { 'python-version': minimumPython },
        notes: [`${reason}, so the CI job runs Python ${minimumPython}.`],
      }
    : {
        settings: { 'python-version': lower },
        notes: [
          `${reason}, which the range leaves out, so the CI job runs Python ${lower} and those checks report that they were skipped. Widen the range to run them.`,
        ],
      };
}

export function pythonVersion(root: string, repository: string): VersionChoice {
  if (hasProjectFile(root, '.python-version')) {
    return pinnedVersionFile(root, repository);
  }
  const pyproject = hasProjectFile(root, 'pyproject.toml')
    ? readFileSync(insideProject(root, 'pyproject.toml'), 'utf8')
    : '';
  const spec = (REQUIRES_PYTHON.exec(pyproject) ?? POETRY_PYTHON.exec(pyproject))?.groups?.['spec'];
  return boundedVersion(spec ?? '');
}
