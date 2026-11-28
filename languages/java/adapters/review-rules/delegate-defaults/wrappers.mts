import { appendAll } from '../../../../../shared/lists/lists.mts';
import { classChain } from '../type-declarations/type-index.mts';
import { methodKey, sameSignature } from '../type-declarations/types.mts';
import type { TypeIndex } from '../type-declarations/type-index.mts';
import type { FieldDecl, MethodDecl, TypeDecl } from '../type-declarations/types.mts';

export type Wrapper = {
  readonly type: TypeDecl;
  readonly delegate: FieldDecl;
  readonly contract: TypeDecl;
  readonly missing: readonly string[];
};

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

function delegateContract(
  link: TypeDecl,
  delegate: FieldDecl,
  { implemented, index }: Pick<Context, 'implemented' | 'index'>,
): TypeDecl | undefined {
  if (delegate.generated || delegate.array || delegate.modifiers.has('static')) {
    return undefined;
  }
  const contract = index.resolve(delegate.type, link);
  return contract?.kind === 'interface' && implemented.has(contract) ? contract : undefined;
}

function forwardsEnough(type: TypeDecl, family: readonly MethodDecl[], delegate: string): boolean {
  const own = type.methods.filter((method) => family.some((each) => sameSignature(each, method)));
  const forwards = own.filter(({ forwardsTo }) => forwardsTo === delegate);
  return forwards.length >= MIN_FORWARDS && forwards.length / own.length >= MIN_FORWARD_SHARE;
}

type Candidate = { readonly link: TypeDecl; readonly field: FieldDecl };

function wrapperFor(
  type: TypeDecl,
  { link, field: delegate }: Candidate,
  context: Context,
): Wrapper | undefined {
  const contract = delegateContract(link, delegate, context);
  if (contract === undefined) {
    return undefined;
  }
  const family = superInterfaces(contract, context.index).flatMap(instanceMethods);
  if (!forwardsEnough(type, family, delegate.name)) {
    return undefined;
  }
  const missing = missingDefaults(family, {
    declaring: [...context.chain, ...context.subclasses],
    implemented: context.implemented,
  });
  return missing.length > 0 && missing.length <= MAX_SKIPPED
    ? { type, delegate, contract, missing }
    : undefined;
}

function wrapperOf(type: TypeDecl, context: Context): Wrapper | undefined {
  const candidates = context.chain.flatMap((link) => link.fields.map((field) => ({ link, field })));
  for (const candidate of candidates) {
    const wrapper = wrapperFor(type, candidate, context);
    if (wrapper !== undefined) {
      return wrapper;
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
