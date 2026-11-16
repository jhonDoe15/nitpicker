import path from 'node:path';
import {
  type Bindings,
  type Definition,
  type Entry,
  type ImportEntry,
  type ProjectIndex,
  type Scope,
  type Target,
} from './jvm-reuse-types.mts';

const TYPE_KINDS = new Set(['class', 'interface', 'enum', 'type']);
export const MEMBER_SEPARATORS: ReadonlySet<string | undefined> = new Set(['.', '::']);
export const CALL_SEPARATORS: ReadonlySet<string | undefined> = new Set(['.', '?.', '::']);
const JVM_NAME = ['@', 'file', ':', 'JvmName', '('];
const COMPANION = 'Companion';

export function isCallSeparator(text: string | undefined): boolean {
  return CALL_SEPARATORS.has(text);
}

function qualified(packageName: string, name: string): string {
  return packageName === '' ? name : `${packageName}.${name}`;
}

function lastSegment(dotted: string): string {
  return dotted.slice(dotted.lastIndexOf('.') + 1);
}

function parentOf(dotted: string): string {
  return dotted.includes('.') ? dotted.slice(0, dotted.lastIndexOf('.')) : '';
}

export function named(name: string, local: string | undefined): { name: string; alias?: string } {
  return local === undefined || local === name ? { name } : { name, alias: local };
}

function preferred<Candidate extends { module?: string | undefined }>(
  candidates: readonly Candidate[],
  module: string,
): Candidate | undefined {
  return candidates.find((candidate) => candidate.module === module) ?? candidates[0];
}

export function typeFile(index: ProjectIndex, fqn: string, module: string): string {
  return preferred(index.types.get(fqn) ?? [], module)?.file ?? '';
}

function addDefinition(
  index: ProjectIndex,
  { file, parsed, module }: Entry,
  { name, kind, owner }: { name: string; kind: string; owner?: string | undefined },
): void {
  if (owner !== undefined) {
    index.members.add(`${file}\0${owner}.${name}`);
    return;
  }
  const type = TYPE_KINDS.has(kind);
  if (type) {
    const fqn = qualified(parsed.packageName, name);
    index.types.set(fqn, [...(index.types.get(fqn) ?? []), { file, module }]);
  }
  const declared = index.packages.get(parsed.packageName) ?? new Map<string, Target[]>();
  const targets = declared.get(name) ?? [];
  if (!targets.some((target) => target.file === file)) {
    declared.set(name, [...targets, { file, name, type, module }]);
  }
}

function facadeName({ file, parsed }: Entry): string {
  const { tokens, headerEnd } = parsed;
  const at = tokens
    .slice(0, headerEnd)
    .findIndex((_, index) =>
      JVM_NAME.every((text, offset) => tokens[index + offset]?.text === text),
    );
  const named = tokens[at + JVM_NAME.length];
  if (at !== -1 && named?.kind === 'string') {
    return named.text.slice(1, -1);
  }
  const stem = path.basename(file, '.kt');
  return `${stem.charAt(0).toUpperCase()}${stem.slice(1)}Kt`;
}

function fileFacade(entry: Entry): { name: string; kind: string }[] {
  const topLevel = entry.parsed.definitions.some(
    ({ owner, kind }) => owner === undefined && !TYPE_KINDS.has(kind) && kind !== 'class',
  );
  return entry.file.endsWith('.kt') && topLevel ? [{ name: facadeName(entry), kind: 'class' }] : [];
}

export function projectIndex(files: readonly Entry[]): ProjectIndex {
  const index: ProjectIndex = { types: new Map(), packages: new Map(), members: new Set() };
  for (const entry of files) {
    const { packageName } = entry.parsed;
    index.packages.set(packageName, index.packages.get(packageName) ?? new Map<string, Target[]>());
    for (const definition of [...entry.parsed.definitions, ...fileFacade(entry)]) {
      addDefinition(index, entry, definition);
    }
  }
  return index;
}

export function visibleTargets(targets: readonly Target[], module: string): Target[] {
  const reachable = targets.some((target) => target.module === module)
    ? module
    : targets[0]?.module;
  const visible = targets.filter((target) => target.module === reachable);
  const types = visible.filter(({ type }) => type === true);
  return types.length > 0 ? types.slice(0, 1) : visible;
}

function packageBindings(
  index: ProjectIndex,
  {
    packageName,
    file,
    own,
    module,
  }: { packageName: string; file: string; own: Set<string>; module: string },
): [string, Target[]][] {
  return [...(index.packages.get(packageName) ?? new Map<string, Target[]>())]
    .filter(([name]) => !own.has(name))
    .map(([name, targets]): [string, Target[]] => [
      name,
      visibleTargets(
        targets.filter((target) => target.file !== file),
        module,
      ),
    ])
    .filter(([, targets]) => targets.length > 0);
}

function memberOwner(index: ProjectIndex, parent: string): string | undefined {
  if (index.types.has(parent)) {
    return parent;
  }
  const outer = parentOf(parent);
  return lastSegment(parent) === COMPANION && index.types.has(outer) ? outer : undefined;
}

function memberImport(
  index: ProjectIndex,
  {
    parent: imported,
    name,
    local,
    module,
  }: { parent: string; name: string; local: string; module: string },
): Target[] {
  const parent = memberOwner(index, imported);
  if (parent === undefined) {
    return [];
  }
  const owner = lastSegment(parent);
  return [{ file: typeFile(index, parent, module), name: `${owner}.${name}`, alias: local }];
}

function explicitTargets(index: ProjectIndex, entry: ImportEntry, module: string): Target[] {
  const name = lastSegment(entry.path);
  const local = entry.alias ?? name;
  const parent = parentOf(entry.path);
  if (index.types.has(entry.path)) {
    return [{ file: typeFile(index, entry.path, module), ...named(name, local), type: true }];
  }
  const topLevel = (index.packages.get(parent)?.get(name) ?? []).filter(({ type }) => !type);
  if (topLevel.length === 0) {
    return memberImport(index, { parent, name, local, module });
  }
  return visibleTargets(topLevel, module).map(({ file }) => ({ file, ...named(name, local) }));
}

function implicitBindings(
  index: ProjectIndex,
  { file, parsed, module }: Entry,
): [string, Target[]][] {
  const own = new Set(
    parsed.definitions.filter(({ owner }) => owner === undefined).map(({ name }) => name),
  );
  const wildcards = parsed.imports
    .filter((entry) => entry.wildcard && !entry.static)
    .map((entry) => entry.path);
  return [...wildcards.toReversed(), parsed.packageName].flatMap((packageName) =>
    packageBindings(index, { packageName, file, own, module }),
  );
}

function explicitBindings(index: ProjectIndex, { parsed, module }: Entry): [string, Target[]][] {
  const explicit = new Map<string, Target[]>();
  for (const entry of parsed.imports.filter(({ wildcard }) => !wildcard)) {
    const local = entry.alias ?? lastSegment(entry.path);
    const targets = explicitTargets(index, entry, module);
    explicit.set(local, [...(explicit.get(local) ?? []), ...targets]);
  }
  return [...explicit].filter(([, targets]) => targets.length > 0);
}

export function fileBindings(index: ProjectIndex, entry: Entry): Bindings {
  const bindings = new Map([...implicitBindings(index, entry), ...explicitBindings(index, entry)]);
  for (const name of entry.parsed.declaredTypes) {
    bindings.delete(name);
  }
  return bindings;
}

function definitionsByName(definitions: readonly Definition[]): Map<string, Definition[]> {
  return Map.groupBy(definitions, (definition) => definition.name);
}

export function referenceScope(index: ProjectIndex, { file, parsed, module }: Entry): Scope {
  const unresolved = parsed.imports.filter(
    (entry) => !entry.wildcard && explicitTargets(index, entry, module).length === 0,
  );
  const stars = parsed.imports
    .filter((entry) => entry.wildcard && !index.packages.has(entry.path))
    .map((entry) => entry.path)
    .sort();
  return {
    file,
    byName: definitionsByName(parsed.definitions),
    external: new Map(
      unresolved.map((entry) => [entry.alias ?? lastSegment(entry.path), `ext:${entry.path}`]),
    ),
    stars: stars.length === 0 ? undefined : `stars:${stars.join(',')}`,
    declaredTypes: parsed.declaredTypes,
    memberNames: parsed.memberNames,
  };
}
