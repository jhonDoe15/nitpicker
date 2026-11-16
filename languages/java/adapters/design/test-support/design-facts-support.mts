import path from 'node:path';
import { type DesignModule, produceDesignFacts } from '../producer/design-facts.mts';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';

type Fact = { readonly id: string; readonly [field: string]: unknown };
type FactsBundle = {
  readonly types: Fact[];
  readonly callables: Fact[];
  readonly modules: unknown[];
  readonly packages: unknown[];
};
type CallableInput = {
  readonly file: string;
  readonly owner: string;
  readonly member: string;
  readonly line: number;
  readonly name?: string;
  readonly root?: string | undefined;
  readonly [field: string]: unknown;
};
type AccessorInput = CallableInput & { readonly returns: string };
type TypeInput = {
  readonly file: string;
  readonly symbol: string;
  readonly line: number;
  readonly kind: string;
  readonly root?: string | undefined;
  readonly [field: string]: unknown;
};

const FIXTURES = path.join(import.meta.dirname, '../fixtures');
const SOURCE_ROOT = 'src/main/java';

export function fixtureRoot(name: string): string {
  return path.join(FIXTURES, name);
}

function isFact(value: unknown): value is Fact {
  return typeof fieldOf(value, 'id') === 'string';
}

export function fixtureFacts(name: string, modules?: readonly DesignModule[]): FactsBundle {
  const bundle = produceDesignFacts({
    projectRoot: fixtureRoot(name),
    modules: modules ?? [{ dir: '', sourceRoots: [SOURCE_ROOT], published: false }],
  });
  return {
    types: listOf(bundle['types']).filter(isFact),
    callables: listOf(bundle['callables']).filter(isFact),
    modules: [...listOf(bundle['modules'])],
    packages: [...listOf(bundle['packages'])],
  };
}

function sourcePath(file: string, root: string = SOURCE_ROOT): string {
  return `${root}/${file}`;
}

export function ref(file: string, symbol: string, root?: string): string {
  return `${sourcePath(file, root)}#${symbol}`;
}

export function callable({
  file,
  owner,
  member,
  line,
  name = member,
  root,
  ...rest
}: CallableInput): Fact {
  return {
    id: ref(file, `${owner}.${member}`, root),
    file: sourcePath(file, root),
    name,
    line,
    kind: 'method',
    owner: ref(file, owner, root),
    exported: true,
    params: [],
    calls: [],
    paramUses: [],
    decisions: [],
    reads: [],
    ...rest,
  };
}

export function accessor({ member, returns, ...rest }: AccessorInput): Fact {
  return callable({ member, kind: 'accessor', returns, returnsField: member, ...rest });
}

export function type({ file, symbol, line, kind, root, ...rest }: TypeInput): Fact {
  return {
    id: ref(file, symbol, root),
    file: sourcePath(file, root),
    name: symbol.split('.').at(-1),
    line,
    kind,
    exported: true,
    fields: [],
    ...rest,
  };
}
