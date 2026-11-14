import path from 'node:path';
import { isPlainObject } from '../../../../shared/config.mjs';
import { parseToml } from '../../../configuration/project-checks/uv-workspace.mjs';
import { parseYaml } from '../../../tooling/yaml/yaml-documents.mjs';

const NPM_LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json']);
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];
const YARN_HEADER = /^"?([^\s"].*?)"?:\s*$/u;
const YARN_VERSION = /^ {2}version:? "?([^"\s]+)"?\s*$/u;
const YARN_DEPENDENCY = /^ {4}"?(@?[^\s"@:]+(?:\/[^\s"@:]+)?)"?:?\s/u;

function emptyLock() {
  return { versions: new Map(), edges: new Map() };
}

function add(lock, name, version, needs = []) {
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
      add(lock, key.slice(at + 'node_modules/'.length), entry.version, dependencyNames(entry));
    }
  }
  return lock;
}

function pnpmName(key) {
  const plain = key.replace(/^\//u, '').replace(/\(.*$/u, '');
  const at = plain.indexOf('@', 1);
  return at === -1
    ? { name: plain, version: '' }
    : { name: plain.slice(0, at), version: plain.slice(at + 1) };
}

function pnpmLock(text) {
  const document = parseYaml(text);
  if (!isPlainObject(document?.packages) && !isPlainObject(document?.importers)) {
    return undefined;
  }
  const lock = emptyLock();
  const entries = { ...(document.packages ?? {}), ...(document.snapshots ?? {}) };
  for (const [key, entry] of Object.entries(entries)) {
    const { name, version } = pnpmName(key);
    add(lock, name, version, dependencyNames(entry));
  }
  return lock;
}

function yarnDescriptorName(descriptor) {
  const plain = descriptor.trim().replace(/^"|"$/gu, '');
  const at = plain.indexOf('@', 1);
  return at === -1 ? plain : plain.slice(0, at);
}

function yarnLock(text) {
  const lock = emptyLock();
  let current;
  for (const line of text.split('\n')) {
    const header =
      line.startsWith(' ') || line.startsWith('#') ? undefined : YARN_HEADER.exec(line);
    if (header !== undefined && header !== null && !line.startsWith('__metadata')) {
      current = { names: header[1].split(/,\s*/u).map(yarnDescriptorName), version: '', needs: [] };
      continue;
    }
    const version = YARN_VERSION.exec(line)?.[1];
    if (current !== undefined && version !== undefined) {
      current.version = version;
      current.names.forEach((name) => add(lock, name, version, []));
      continue;
    }
    const need = YARN_DEPENDENCY.exec(line)?.[1];
    if (current !== undefined && need !== undefined) {
      current.names.forEach((name) => add(lock, name, current.version, [need]));
    }
  }
  return lock;
}

function uvLock(text) {
  const packages = parseToml(text)?.package;
  if (!Array.isArray(packages)) {
    return undefined;
  }
  const lock = emptyLock();
  for (const entry of packages) {
    const needs = (Array.isArray(entry.dependencies) ? entry.dependencies : []).map(
      ({ name }) => name,
    );
    add(lock, entry.name, entry.version ?? '', needs);
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

export function changedPackages(base, head) {
  const names = new Set([...base.versions.keys(), ...head.versions.keys()]);
  const changed = new Map();
  for (const name of names) {
    const before = [...(base.versions.get(name) ?? [])].filter(Boolean).toSorted().join(', ');
    const after = [...(head.versions.get(name) ?? [])].filter(Boolean).toSorted().join(', ');
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
