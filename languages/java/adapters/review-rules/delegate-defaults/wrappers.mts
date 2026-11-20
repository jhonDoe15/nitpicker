import { appendAll } from '../../../../../shared/lists/lists.mts';
import { methodKey, sameSignature } from './types.mts';
import type { FieldDecl, MethodDecl, TypeDecl } from './types.mts';

export type TypeIndex = {
  readonly resolve: (name: string | undefined, from: TypeDecl) => TypeDecl | undefined;
};

export type Wrapper = {
  readonly type: TypeDecl;
  readonly delegate: FieldDecl;
  readonly contract: TypeDecl;
  readonly missing: readonly string[];
};

function importPath(type: TypeDecl): string {
  return `${type.scope}.${type.name}`;
}

function pick(candidates: readonly TypeDecl[], from: TypeDecl): TypeDecl | undefined {
  const imported = candidates.filter(
    (type) => from.imports.includes(importPath(type)) || from.imports.includes(`${type.scope}.*`),
  );
  const nested = candidates.filter(
    (type) => from.scope === type.scope || from.scope.startsWith(`${type.scope}.`),
  );
  const samePackage = candidates.filter((type) => type.pkg === from.pkg);
  for (const group of [imported, nested, samePackage]) {
    if (group.length === 1) {
      return group[0];
    }
    if (group.length > 1) {
      return undefined;
    }
  }
  return undefined;
}

export function indexOf(types: readonly TypeDecl[]): TypeIndex {
  const byName = new Map<string, TypeDecl[]>();
  for (const type of types) {
    byName.set(type.name, [...(byName.get(type.name) ?? []), type]);
  }
  return {
    resolve(name, from) {
      const candidates = name === undefined ? [] : (byName.get(name) ?? []);
      const foreign = from.imports.some(
        (path) =>
          path.endsWith(`.${name ?? ''}`) && !candidates.some((c) => importPath(c) === path),
      );
      return foreign ? undefined : pick(candidates, from);
    },
  };
}

const MAX_SKIPPED = 3;
const MIN_FORWARDS = 2;
const MIN_FORWARD_SHARE = 0.8;
const DEFAULT = 'default';
const OBJECT_ONLY = new Set(['static', 'private']);

function superInterfaces(start: TypeDecl, index: TypeIndex): TypeDecl[] {
  const seen = new Set<TypeDecl>();
  const queue = [start];
  for (const type of queue) {
    const parents = seen.has(type) ? [] : type.interfaces.map((name) => index.resolve(name, type));
    seen.add(type);
    appendAll(
      queue,
      parents.filter((parent): parent is TypeDecl => parent !== undefined),
    );
  }
  return [...seen].filter((type) => type.kind === 'interface');
}

function classChain(type: TypeDecl, index: TypeIndex): TypeDecl[] {
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

function hasExternalSuperclass(chain: readonly TypeDecl[], index: TypeIndex): boolean {
  return chain.some((link) => {
    const parent = index.resolve(link.superclass, link);
    return link.superclass !== undefined && (parent === undefined || parent.kind !== 'class');
  });
}

function instanceMethods(type: TypeDecl): MethodDecl[] {
  return type.methods.filter(({ modifiers }) => ![...modifiers].some((m) => OBJECT_ONLY.has(m)));
}

function isDefault({ modifiers }: MethodDecl): boolean {
  return modifiers.has(DEFAULT);
}

type Context = {
  readonly chain: readonly TypeDecl[];
  readonly subclasses: readonly TypeDecl[];
  readonly implemented: ReadonlySet<TypeDecl>;
  readonly index: TypeIndex;
};

function declares(types: readonly TypeDecl[], method: MethodDecl): boolean {
  return types.some(({ methods }) => methods.some((each) => sameSignature(each, method)));
}

function missingDefaults(
  family: readonly MethodDecl[],
  {
    declaring,
    implemented,
  }: { declaring: readonly TypeDecl[]; implemented: ReadonlySet<TypeDecl> },
): string[] {
  const derived = [...implemented]
    .flatMap(instanceMethods)
    .filter((method) => isDefault(method) && !method.selfContained);
  const abstracts = family.filter((method) => !isDefault(method));
  const names = family
    .filter(isDefault)
    .filter(
      (method) =>
        !(
          declares(declaring, method) ||
          [...abstracts, ...derived].some((each) => sameSignature(each, method))
        ),
    )
    .map(methodKey);
  return [...new Set(names)];
}

function wrapperOf(
  type: TypeDecl,
  { chain, subclasses, implemented, index }: Context,
): Wrapper | undefined {
  const fields = chain.flatMap((link) => link.fields.map((field) => ({ link, field })));
  for (const { link, field: delegate } of fields) {
    const contract = index.resolve(delegate.type, link);
    if (delegate.generated || contract?.kind !== 'interface' || !implemented.has(contract)) {
      continue;
    }
    const family = superInterfaces(contract, index).flatMap(instanceMethods);
    const own = type.methods.filter((method) => family.some((each) => sameSignature(each, method)));
    const forwards = own.filter(({ forwardsTo }) => forwardsTo === delegate.name);
    if (forwards.length < MIN_FORWARDS || forwards.length / own.length < MIN_FORWARD_SHARE) {
      continue;
    }
    const missing = missingDefaults(family, {
      declaring: [...chain, ...subclasses],
      implemented,
    });
    if (missing.length > 0 && missing.length <= MAX_SKIPPED) {
      return { type, delegate, contract, missing };
    }
  }
  return undefined;
}

export function wrappersIn(types: readonly TypeDecl[], index: TypeIndex): Wrapper[] {
  const classes = types.filter(({ kind }) => kind === 'class');
  const chains = new Map(classes.map((type) => [type, classChain(type, index)]));
  return classes.flatMap((type) => {
    const chain = chains.get(type) ?? [type];
    if (hasExternalSuperclass(chain, index)) {
      return [];
    }
    const subclasses = classes.filter(
      (other) => other !== type && (chains.get(other) ?? []).includes(type),
    );
    const implemented = new Set(
      chain.flatMap((link) =>
        link.interfaces.flatMap((name) => {
          const direct = index.resolve(name, link);
          return direct === undefined ? [] : superInterfaces(direct, index);
        }),
      ),
    );
    return wrapperOf(type, { chain, subclasses, implemented, index }) ?? [];
  });
}
