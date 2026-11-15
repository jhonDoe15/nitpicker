import type TypeScript from 'typescript';

export type ContainerApi = {
  readonly library: string;
  readonly owner: string;
  readonly member: string;
  readonly packages: readonly string[];
};
type NameEntry = { readonly packages: RegExp; readonly names: ReadonlySet<string> };

const RESOLVE = 'resolve';
const INVERSIFY_LOOKUPS = [
  'get',
  'getAsync',
  'getAll',
  'getAllAsync',
  'getNamed',
  'getNamedAsync',
  'getAllNamed',
  'getAllNamedAsync',
  'getTagged',
  'getTaggedAsync',
  'getAllTagged',
  'getAllTaggedAsync',
  RESOLVE,
];

const CONTAINER_APIS = [
  {
    packages: ['inversify', '@inversifyjs/container'],
    owner: 'Container',
    members: new Set(INVERSIFY_LOOKUPS),
  },
  {
    packages: ['tsyringe'],
    owner: 'DependencyContainer',
    members: new Set([RESOLVE, 'resolveAll']),
  },
  {
    packages: ['typedi'],
    owner: 'Container',
    members: new Set(['get', 'getMany']),
  },
  {
    packages: ['typedi'],
    owner: 'ContainerInstance',
    members: new Set(['get', 'getMany']),
  },
  {
    packages: ['awilix'],
    owner: 'AwilixContainer',
    members: new Set([RESOLVE, 'cradle']),
  },
  {
    packages: ['@nestjs/core'],
    owner: 'ModuleRef',
    members: new Set(['get', RESOLVE, 'create']),
  },
  {
    packages: ['@nestjs/core'],
    owner: 'NestApplicationContext',
    members: new Set(['get', RESOLVE]),
  },
  {
    packages: ['@nestjs/common'],
    owner: 'INestApplicationContext',
    members: new Set(['get', RESOLVE]),
  },
];

const REGISTRATION_CALLS: readonly NameEntry[] = [
  {
    packages: /^(?:inversify|@inversifyjs\/)/u,
    names: new Set(['toDynamicValue', 'toFactory', 'toProvider', 'onActivation']),
  },
  { packages: /^awilix$/u, names: new Set(['asFunction', 'asClass', 'asValue']) },
];
const FACTORY_HOLDERS: readonly NameEntry[] = [
  { packages: /^typedi$/u, names: new Set(['set', 'Service']) },
];
const LOOKUP_MEMBER_NAMES = new Set(CONTAINER_APIS.flatMap((api) => [...api.members]));
const MODELED_PACKAGES = new Set(CONTAINER_APIS.flatMap((api) => api.packages));
const MODELED_SCOPE = '@inversifyjs/';

export function isModeledPackage(specifier: string): boolean {
  return MODELED_PACKAGES.has(specifier) || specifier.startsWith(MODELED_SCOPE);
}

export function isRegistrationProperty(name: string | undefined): boolean {
  return name === 'useFactory';
}

export function isFactoryProperty(name: string | undefined): boolean {
  return name === 'factory';
}

export function isRegistrationName(name: string): boolean {
  return REGISTRATION_CALLS.some((entry) => entry.names.has(name));
}

export function isFactoryHolderName(name: string): boolean {
  return FACTORY_HOLDERS.some((entry) => entry.names.has(name));
}

export function isLookupMemberName(name: string): boolean {
  return LOOKUP_MEMBER_NAMES.has(name);
}

const NODE_MODULES = '/node_modules/';

function packageOf(fileName: string): string | undefined {
  const normalized = fileName.replaceAll('\\', '/');
  const marker = normalized.lastIndexOf(NODE_MODULES);
  if (marker === -1) {
    return undefined;
  }
  const [first = '', second = ''] = normalized.slice(marker + NODE_MODULES.length).split('/');
  return first.startsWith('@') ? `${first}/${second}` : first;
}

function ownerName(node: TypeScript.Node): string | undefined {
  const name = 'name' in node ? node.name : undefined;
  return typeof name === 'object' &&
    name !== null &&
    'text' in name &&
    typeof name.text === 'string'
    ? name.text
    : undefined;
}

export function containerApiOf(symbol: TypeScript.Symbol | undefined): ContainerApi | undefined {
  if (symbol === undefined) {
    return undefined;
  }
  for (const declaration of symbol.declarations ?? []) {
    const owner = ownerName(declaration.parent);
    const library = packageOf(declaration.getSourceFile().fileName);
    const api =
      library === undefined
        ? undefined
        : CONTAINER_APIS.find((entry) => entry.owner === owner && entry.packages.includes(library));
    if (library !== undefined && api?.members.has(symbol.name) === true) {
      return { library, owner: api.owner, member: symbol.name, packages: api.packages };
    }
  }
  return undefined;
}

function declaredIn(symbol: TypeScript.Symbol | undefined, entries: readonly NameEntry[]): boolean {
  if (symbol === undefined) {
    return false;
  }
  return entries.some(
    (entry) =>
      entry.names.has(symbol.name) &&
      (symbol.declarations ?? []).some((declaration) =>
        entry.packages.test(packageOf(declaration.getSourceFile().fileName) ?? ''),
      ),
  );
}

export function isRegistrationSymbol(symbol: TypeScript.Symbol | undefined): boolean {
  return declaredIn(symbol, REGISTRATION_CALLS);
}

export function isFactoryHolderSymbol(symbol: TypeScript.Symbol | undefined): boolean {
  return declaredIn(symbol, FACTORY_HOLDERS);
}

export function displayedLibrary(found: ContainerApi, imported: readonly string[]): string {
  return imported.find((name) => found.packages.includes(name)) ?? found.library;
}
