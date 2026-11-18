import path from 'node:path';
import { isPlainObject } from '../../../../shared/config.mjs';
import { parseToml } from '../../../configuration/project-checks/uv-workspace.mjs';
import { parseYaml } from '../../../tooling/yaml/yaml-documents.mjs';

const NPM_LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json']);
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];
const YARN_HEADER = /^"?([^\s"].*?)"?:\s*$/u;
const YARN_VERSION = /^ {2}version:? "?([^"\s]+)"?\s*$/u;
const YARN_DEPENDENCY = /^ {4}"?(@?[^\s"@:/]+(?:\/[^\s"@:/]+)?)"?:?\s/u;
const PNPM_V5_KEY = /^\/((?:@[^/]+\/)?[^/@]+)\/([^/]+)$/u;
const PYTHON_NAME_SEPARATORS = /[-_.]+/gu;
const UV_DEPENDENCY_TABLES = ['optional-dependencies', 'dev-dependencies'];

function emptyLock() {
  return { versions: new Map(), edges: new Map() };
}

function add(lock, { name, version, needs = [] }) {
  lock.versions.set(name, new Set([...(lock.versions.get(name) ?? []), String(version)]));
  lock.edges.set(name, new Set([...(lock.edges.get(name) ?? []), ...needs]));
}

function dependencyNames(entry) {
  return DEPENDENCY_FIELDS.flatMap((field) =>
    isPlainObject(entry?.[field]) ? Object.keys(entry[field]) : [],
  );
}

function npmLock(text) {
  const packages = JSON.parse(text)?.packages;
  if (!isPlainObject(packages)) {
    return undefined;
  }
  const lock = emptyLock();
  for (const [key, entry] of Object.entries(packages)) {
    const at = key.lastIndexOf('node_modules/');
    if (at !== -1 && entry?.version !== undefined) {
      add(lock, {
        name: key.slice(at + 'node_modules/'.length),
        version: entry.version,
        needs: dependencyNames(entry),
      });
    }
  }
  return lock;
}

function pnpmName(key) {
  const older = PNPM_V5_KEY.exec(key);
  if (older !== null) {
    return { name: older[1], version: older[2] };
  }
  const plain = key.replace(/^\//u, '').replace(/\(.*$/u, '');
  const at = plain.indexOf('@', 1);
  return at === -1
    ? { name: plain, version: '' }
    : { name: plain.slice(0, at), version: plain.slice(at + 1) };
}

function pnpmLock(text) {
  const document = parseYaml(text);
  if (!(isPlainObject(document?.packages) || isPlainObject(document?.importers))) {
    return undefined;
  }
  const lock = emptyLock();
  const entries = { ...document.packages, ...document.snapshots };
  for (const [key, entry] of Object.entries(entries)) {
    add(lock, { ...pnpmName(key), needs: dependencyNames(entry) });
  }
  return lock;
}

function yarnDescriptorName(descriptor) {
  const plain = descriptor.trim().replace(/^"|"$/gu, '');
  const at = plain.indexOf('@', 1);
  return at === -1 ? plain : plain.slice(0, at);
}

function yarnHeader(line) {
  if (line.startsWith(' ') || line.startsWith('#') || line.startsWith('__metadata')) {
    return undefined;
  }
  return YARN_HEADER.exec(line)?.[1];
}

function readYarnLine(lock, current, line) {
  const header = yarnHeader(line);
  if (header !== undefined) {
    return { names: header.split(/,\s*/u).map(yarnDescriptorName), version: '' };
  }
  if (current === undefined) {
    return undefined;
  }
  const version = YARN_VERSION.exec(line)?.[1];
  const need = YARN_DEPENDENCY.exec(line)?.[1];
  const entry = version === undefined ? current : { ...current, version };
  for (const name of entry.names) {
    add(lock, { name, version: entry.version, needs: need === undefined ? [] : [need] });
  }
  return entry;
}

function yarnLock(text) {
  const lock = emptyLock();
  let current;
  for (const line of text.split('\n')) {
    current = readYarnLine(lock, current, line);
  }
  return lock;
}

export function pythonPackageName(name) {
  return String(name).toLowerCase().replaceAll(PYTHON_NAME_SEPARATORS, '-');
}

function uvNeeds(entry) {
  const groups = UV_DEPENDENCY_TABLES.flatMap((table) =>
    isPlainObject(entry[table]) ? Object.values(entry[table]) : [],
  );
  return [entry.dependencies, ...groups]
    .flatMap((listed) => (Array.isArray(listed) ? listed : []))
    .map(({ name }) => pythonPackageName(name));
}

function uvLock(text) {
  const packages = parseToml(text)?.package;
  if (!Array.isArray(packages)) {
    return undefined;
  }
  const lock = emptyLock();
  for (const entry of packages) {
    add(lock, {
      name: pythonPackageName(entry.name),
      version: entry.version ?? '',
      needs: uvNeeds(entry),
    });
  }
  return lock;
}

const PARSERS = new Map([
  ['pnpm-lock.yaml', pnpmLock],
  ['yarn.lock', yarnLock],
  ['uv.lock', uvLock],
]);

export function isLockfile(file) {
  const name = path.posix.basename(file);
  return NPM_LOCKFILES.has(name) || PARSERS.has(name);
}

export function parseLockfile(file, text) {
  const name = path.posix.basename(file);
  const parse = NPM_LOCKFILES.has(name) ? npmLock : PARSERS.get(name);
  try {
    return { lock: parse(text) };
  } catch (error) {
    return { lock: undefined, error };
  }
}

function versionsText(lock, name) {
  return [...(lock.versions.get(name) ?? [])]
    .filter(Boolean)
    .toSorted((left, right) => left.localeCompare(right))
    .join(', ');
}

export function changedPackages(base, head) {
  const names = new Set([...base.versions.keys(), ...head.versions.keys()]);
  const changed = new Map();
  for (const name of names) {
    const before = versionsText(base, name);
    const after = versionsText(head, name);
    if (before !== after) {
      changed.set(name, `${name} ${before || 'none'} -> ${after || 'none'}`);
    }
  }
  return changed;
}

export function closureOf(lock, direct) {
  const reached = new Set(direct);
  for (const name of reached) {
    for (const need of lock.edges.get(name) ?? []) {
      reached.add(need);
    }
  }
  return reached;
}
