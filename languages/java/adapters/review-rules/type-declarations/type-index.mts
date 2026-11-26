import type { TypeDecl } from './types.mts';

export type TypeIndex = {
  readonly resolve: (name: string | undefined, from: TypeDecl) => TypeDecl | undefined;
};

type Named = (name: string) => readonly TypeDecl[];

function importPath(type: TypeDecl): string {
  return `${type.scope}.${type.name}`;
}

function enclosing(type: TypeDecl, from: TypeDecl): boolean {
  const member = type.scope !== type.pkg;
  const inside = `${from.scope}.${from.name}`;
  return (
    member &&
    (type.scope === inside || type.scope === from.scope || from.scope.startsWith(`${type.scope}.`))
  );
}

function singleImport(name: string, candidates: readonly TypeDecl[], from: TypeDecl): TypeDecl[] {
  const imported = new Set(from.imports.filter((path) => path.endsWith(`.${name}`)));
  return imported.size === 0
    ? []
    : [candidates.find((type) => imported.has(importPath(type))) ?? from];
}

function simpleName(named: Named, name: string, from: TypeDecl): TypeDecl | undefined {
  const candidates = named(name);
  const groups = [
    candidates.filter((type) => enclosing(type, from)),
    singleImport(name, candidates, from),
    candidates.filter((type) => type.pkg === from.pkg && type.scope === type.pkg),
    candidates.filter((type) => from.imports.includes(`${type.scope}.*`)),
  ];
  const found = groups.find((group) => group.length > 0) ?? [];
  const [only] = found;
  return found.length === 1 && only !== from ? only : undefined;
}

function qualifiedName(named: Named, name: string, from: TypeDecl): TypeDecl | undefined {
  const parts = name.split('.');
  const last = parts.at(-1) ?? '';
  const exact = named(last).filter((type) => importPath(type) === name);
  if (exact.length > 0) {
    return exact.length === 1 ? exact[0] : undefined;
  }
  let current = simpleName(named, parts[0] ?? '', from);
  for (const part of parts.slice(1)) {
    const outer = current === undefined ? '' : importPath(current);
    current = named(part).find((type) => type.scope === outer);
  }
  return current;
}

export function indexOf(types: readonly TypeDecl[]): TypeIndex {
  const byName = new Map<string, TypeDecl[]>();
  for (const type of types) {
    const group = byName.get(type.name);
    if (group) {
      group.push(type);
    } else {
      byName.set(type.name, [type]);
    }
  }
  function named(name: string): readonly TypeDecl[] {
    return byName.get(name) ?? [];
  }
  return {
    resolve(name, from) {
      if (name === undefined || name === '') {
        return undefined;
      }
      return name.includes('.') ? qualifiedName(named, name, from) : simpleName(named, name, from);
    },
  };
}

export function classChain(type: TypeDecl, index: TypeIndex): TypeDecl[] {
  const chain = [type];
  const linked = new Set(chain);
  for (const link of chain) {
    const parent = index.resolve(link.superclass, link);
    if (parent !== undefined && parent.kind === 'class' && !linked.has(parent)) {
      linked.add(parent);
      chain.push(parent);
    }
  }
  return chain;
}
