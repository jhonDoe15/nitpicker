import path from 'node:path';
import { fieldOf, fieldsOf, isPlainObject, textOf } from '../../../../shared/values/readers.mts';
import { parseToml as untypedParseToml } from '../../../configuration/project-checks/uv-workspace.mts';
import { parseYaml as untypedParseYaml } from '../../../tooling/yaml/yaml-documents.mts';

export type Lock = {
  readonly versions: Map<string, Set<string>>;
  readonly edges: Map<string, Set<string>>;
};
type Parser = (text: string) => Lock | undefined;
type YarnEntry = { readonly names: string[]; readonly version: string };

const parseToml: (text: string) => unknown = untypedParseToml;
const parseYaml: (text: string) => unknown = untypedParseYaml;

const PACKAGES = 'packages';
const NPM_LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json']);
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];
const YARN_HEADER = /^"?([^\s"].*?)"?:\s*$/u;
const YARN_VERSION = /^ {2}version:? "?([^"\s]+)"?\s*$/u;
const YARN_DEPENDENCY = /^ {4}"?(@?[^\s"@:/]+(?:\/[^\s"@:/]+)?)"?:?\s/u;
const PNPM_V5_KEY = /^\/((?:@[^/]+\/)?[^/@]+)\/([^/]+)$/u;
const PYTHON_NAME_SEPARATORS = /[-_.]+/gu;
const UV_DEPENDENCY_TABLES = ['optional-dependencies', 'dev-dependencies'];

function emptyLock(): Lock {
  return { versions: new Map(), edges: new Map() };
}

function add(
  lock: Lock,
  {
    name,
    version,
    needs = [],
  }: { readonly name: string; readonly version: unknown; readonly needs?: readonly string[] },
): void {
  lock.versions.set(name, new Set([...(lock.versions.get(name) ?? []), textOf(version)]));
  lock.edges.set(name, new Set([...(lock.edges.get(name) ?? []), ...needs]));
}

function dependencyNames(entry: unknown): string[] {
  return DEPENDENCY_FIELDS.flatMap((field) => {
    const table = fieldOf(entry, field);
    return isPlainObject(table) ? Object.keys(table) : [];
  });
}

function npmLock(text: string): Lock | undefined {
  const packages = fieldOf(JSON.parse(text), PACKAGES);
  if (!isPlainObject(packages)) {
    return undefined;
  }
  const lock = emptyLock();
  for (const [key, entry] of Object.entries(packages)) {
    const at = key.lastIndexOf('node_modules/');
    if (at !== -1 && fieldOf(entry, 'version') !== undefined) {
      add(lock, {
        name: key.slice(at + 'node_modules/'.length),
        version: fieldOf(entry, 'version'),
        needs: dependencyNames(entry),
      });
    }
  }
  return lock;
}

function pnpmName(key: string): { readonly name: string; readonly version: string } {
  const older = PNPM_V5_KEY.exec(key);
  if (older !== null) {
    return { name: older[1] ?? '', version: older[2] ?? '' };
  }
  const plain = key.replace(/^\//u, '').replace(/\(.*$/u, '');
  const at = plain.indexOf('@', 1);
  return at === -1
    ? { name: plain, version: '' }
    : { name: plain.slice(0, at), version: plain.slice(at + 1) };
}

function pnpmLock(text: string): Lock | undefined {
  const document = parseYaml(text);
  if (!(
    isPlainObject(fieldOf(document, PACKAGES)) || isPlainObject(fieldOf(document, 'importers'))
  )) {
    return undefined;
  }
  const lock = emptyLock();
  const entries = {
    ...fieldsOf(fieldOf(document, PACKAGES)),
    ...fieldsOf(fieldOf(document, 'snapshots')),
  };
  for (const [key, entry] of Object.entries(entries)) {
    add(lock, { ...pnpmName(key), needs: dependencyNames(entry) });
  }
  return lock;
}

function yarnDescriptorName(descriptor: string): string {
  const plain = descriptor.trim().replace(/^"|"$/gu, '');
  const at = plain.indexOf('@', 1);
  return at === -1 ? plain : plain.slice(0, at);
}

function yarnHeader(line: string): string | undefined {
  if (line.startsWith(' ') || line.startsWith('#') || line.startsWith('__metadata')) {
    return undefined;
  }
  return YARN_HEADER.exec(line)?.[1];
}

function readYarnLine(
  lock: Lock,
  current: YarnEntry | undefined,
  line: string,
): YarnEntry | undefined {
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

function yarnLock(text: string): Lock {
  const lock = emptyLock();
  let current: YarnEntry | undefined;
  for (const line of text.split('\n')) {
    current = readYarnLine(lock, current, line);
  }
  return lock;
}

export function pythonPackageName(name: unknown): string {
  return textOf(name).toLowerCase().replaceAll(PYTHON_NAME_SEPARATORS, '-');
}

function uvNeeds(entry: unknown): string[] {
  const groups = UV_DEPENDENCY_TABLES.flatMap((table) => {
    const tables = fieldOf(entry, table);
    return isPlainObject(tables) ? Object.values(tables) : [];
  });
  return [fieldOf(entry, 'dependencies'), ...groups]
    .flatMap((listed): unknown[] => (Array.isArray(listed) ? listed : []))
    .map((dependency) => pythonPackageName(fieldOf(dependency, 'name')));
}

function uvLock(text: string): Lock | undefined {
  const packages: unknown = fieldOf(parseToml(text), 'package');
  if (!Array.isArray(packages)) {
    return undefined;
  }
  const lock = emptyLock();
  for (const entry of packages) {
    add(lock, {
      name: pythonPackageName(fieldOf(entry, 'name')),
      version: fieldOf(entry, 'version') ?? '',
      needs: uvNeeds(entry),
    });
  }
  return lock;
}

const PARSERS = new Map<string, Parser>([
  ['pnpm-lock.yaml', pnpmLock],
  ['yarn.lock', yarnLock],
  ['uv.lock', uvLock],
]);

export function isLockfile(file: string): boolean {
  const name = path.posix.basename(file);
  return NPM_LOCKFILES.has(name) || PARSERS.has(name);
}

export function parseLockfile(
  file: string,
  text: string,
): { readonly lock: Lock | undefined; readonly error?: unknown } {
  const name = path.posix.basename(file);
  const parse = NPM_LOCKFILES.has(name) ? npmLock : PARSERS.get(name);
  try {
    if (parse === undefined) {
      throw new TypeError('parse is not a function');
    }
    return { lock: parse(text) };
  } catch (error) {
    return { lock: undefined, error };
  }
}

function versionsText(lock: Lock, name: string): string {
  return [...(lock.versions.get(name) ?? [])]
    .filter(Boolean)
    .toSorted((left, right) => left.localeCompare(right))
    .join(', ');
}

export function changedPackages(base: Lock, head: Lock): Map<string, string> {
  const names = new Set([...base.versions.keys(), ...head.versions.keys()]);
  const changed = new Map<string, string>();
  for (const name of names) {
    const before = versionsText(base, name);
    const after = versionsText(head, name);
    if (before !== after) {
      changed.set(name, `${name} ${before || 'none'} -> ${after || 'none'}`);
    }
  }
  return changed;
}

export function closureOf(lock: Lock, direct: Iterable<string>): Set<string> {
  const reached = new Set(direct);
  for (const name of reached) {
    for (const need of lock.edges.get(name) ?? []) {
      reached.add(need);
    }
  }
  return reached;
}
