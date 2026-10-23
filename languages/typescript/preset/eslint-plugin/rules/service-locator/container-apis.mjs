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

const REGISTRATION_CALLBACK_METHODS = new Set([
  'toDynamicValue',
  'toFactory',
  'toProvider',
  'onActivation',
]);
const REGISTRATION_PACKAGES = /^(?:inversify|@inversifyjs\/)/u;
const LOOKUP_MEMBER_NAMES = new Set(CONTAINER_APIS.flatMap((api) => [...api.members]));

const REGISTRATION_CALLBACK_PROPERTIES = new Set(['useFactory']);

export function isRegistrationProperty(name) {
  return REGISTRATION_CALLBACK_PROPERTIES.has(name);
}

export function isRegistrationName(name) {
  return REGISTRATION_CALLBACK_METHODS.has(name);
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
      return { library, owner, member: symbol.name };
    }
  }
  return undefined;
}

export function isRegistrationSymbol(symbol) {
  return (
    REGISTRATION_CALLBACK_METHODS.has(symbol?.name) &&
    (symbol.declarations ?? []).some((declaration) =>
      REGISTRATION_PACKAGES.test(packageOf(declaration.getSourceFile().fileName) ?? ''),
    )
  );
}
