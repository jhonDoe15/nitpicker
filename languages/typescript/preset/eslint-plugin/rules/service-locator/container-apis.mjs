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
  'resolve',
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
    members: new Set(['resolve', 'resolveAll']),
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
    members: new Set(['resolve', 'cradle']),
  },
  {
    packages: ['@nestjs/core'],
    owner: 'ModuleRef',
    members: new Set(['get', 'resolve', 'create']),
  },
  {
    packages: ['@nestjs/core'],
    owner: 'NestApplicationContext',
    members: new Set(['get', 'resolve']),
  },
  {
    packages: ['@nestjs/common'],
    owner: 'INestApplicationContext',
    members: new Set(['get', 'resolve']),
  },
];

const REGISTRATION_CALLS = [
  {
    packages: /^(?:inversify|@inversifyjs\/)/u,
    names: new Set(['toDynamicValue', 'toFactory', 'toProvider', 'onActivation']),
  },
  { packages: /^awilix$/u, names: new Set(['asFunction', 'asClass', 'asValue']) },
];
const FACTORY_HOLDERS = [{ packages: /^typedi$/u, names: new Set(['set', 'Service']) }];
const LOOKUP_MEMBER_NAMES = new Set(CONTAINER_APIS.flatMap((api) => [...api.members]));
const MODELED_PACKAGES = new Set(CONTAINER_APIS.flatMap((api) => api.packages));
const MODELED_SCOPE = '@inversifyjs/';

export function isModeledPackage(specifier) {
  return MODELED_PACKAGES.has(specifier) || specifier.startsWith(MODELED_SCOPE);
}

export function isRegistrationProperty(name) {
  return name === 'useFactory';
}

export function isFactoryProperty(name) {
  return name === 'factory';
}

export function isRegistrationName(name) {
  return REGISTRATION_CALLS.some((entry) => entry.names.has(name));
}

export function isFactoryHolderName(name) {
  return FACTORY_HOLDERS.some((entry) => entry.names.has(name));
}

export function isLookupMemberName(name) {
  return LOOKUP_MEMBER_NAMES.has(name);
}

const NODE_MODULES = '/node_modules/';

function packageOf(fileName) {
  const normalized = fileName.replaceAll('\\', '/');
  const marker = normalized.lastIndexOf(NODE_MODULES);
  if (marker === -1) {
    return undefined;
  }
  const [first, second] = normalized.slice(marker + NODE_MODULES.length).split('/');
  return first.startsWith('@') ? `${first}/${second}` : first;
}

export function containerApiOf(symbol) {
  for (const declaration of symbol?.declarations ?? []) {
    const owner = declaration.parent?.name?.text;
    const library = packageOf(declaration.getSourceFile().fileName);
    const api = CONTAINER_APIS.find(
      (entry) => entry.owner === owner && entry.packages.includes(library),
    );
    if (api?.members.has(symbol.name) === true) {
      return { library, owner, member: symbol.name, packages: api.packages };
    }
  }
  return undefined;
}

function declaredIn(symbol, entries) {
  return entries.some(
    (entry) =>
      entry.names.has(symbol?.name) &&
      (symbol.declarations ?? []).some((declaration) =>
        entry.packages.test(packageOf(declaration.getSourceFile().fileName) ?? ''),
      ),
  );
}

export function isRegistrationSymbol(symbol) {
  return declaredIn(symbol, REGISTRATION_CALLS);
}

export function isFactoryHolderSymbol(symbol) {
  return declaredIn(symbol, FACTORY_HOLDERS);
}

export function displayedLibrary(found, imported) {
  return imported.find((name) => found.packages.includes(name)) ?? found.library;
}
