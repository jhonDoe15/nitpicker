const KOIN_LOOKUPS = ['get', 'getOrNull', 'inject', 'injectOrNull'];
const KOIN_OWNERS = [
  'org.koin.core.component',
  'org.koin.android.ext.android',
  'org.koin.ktor.ext',
  'org.koin.java.KoinJavaComponent',
];
const KOIN_RECEIVERS = ['org.koin.core.Koin', 'org.koin.core.scope.Scope'];
const GUICE_INJECTOR = 'com.google.inject.Injector';
const CDI_TYPES = ['jakarta', 'javax'].map((base) => `${base}.enterprise.inject.spi.CDI`);
const BEAN_MANAGERS = ['jakarta', 'javax'].flatMap((base) => [
  `${base}.enterprise.inject.spi.BeanManager`,
  `${base}.enterprise.inject.spi.BeanContainer`,
]);
const JNDI_CONTEXTS = [
  'Context',
  'InitialContext',
  'directory.DirContext',
  'directory.InitialDirContext',
  'ldap.LdapContext',
  'ldap.InitialLdapContext',
  'event.EventContext',
  'event.EventDirContext',
].map((name) => `javax.naming.${name}`);

export const GUICE_MODULES = [
  'com.google.inject.AbstractModule',
  'com.google.inject.Module',
  'com.google.inject.PrivateModule',
  'com.google.inject.servlet.ServletModule',
];
export const PRODUCING_ANNOTATIONS = [
  'com.google.inject.Provides',
  'jakarta.enterprise.inject.Produces',
  'javax.enterprise.inject.Produces',
];
export const ROOT_ANNOTATIONS = ['org.springframework.boot.autoconfigure.SpringBootApplication'];
export const ROOT_SUPERTYPES = ['android.app.Application', 'androidx.multidex.MultiDexApplication'];
export const KTOR_APPLICATION = 'io.ktor.server.application.Application';
export const DEFINITION_HOSTS = new Set([
  'module',
  'single',
  'factory',
  'scoped',
  'scope',
  'viewModel',
  'worker',
  'startKoin',
  'koinApplication',
  'koinConfiguration',
]);
export const START_KOIN = 'startKoin';

const FUNCTION_APIS = [
  ...KOIN_LOOKUPS.map((name) => ({ name, owners: KOIN_OWNERS })),
  { name: 'getKoin', owners: [...KOIN_OWNERS, 'org.koin.compose'] },
  { name: 'koinInject', owners: ['org.koin.compose', 'org.koin.androidx.compose'] },
  { name: 'koinViewModel', owners: ['org.koin.compose.viewmodel', 'org.koin.androidx.compose'] },
];
const STATIC_APIS = [
  { owner: 'org.koin.core.context.GlobalContext', names: ['get', 'getOrNull'] },
  { owner: 'org.koin.mp.KoinPlatform', names: ['getKoin'] },
  { owner: 'org.koin.java.KoinJavaComponent', names: [...KOIN_LOOKUPS, 'getKoin'] },
  ...CDI_TYPES.map((owner) => ({ owner, names: ['current'] })),
];
const RECEIVER_APIS = [
  {
    receivers: [GUICE_INJECTOR],
    names: ['getInstance', 'getProvider', 'getBinding', 'getExistingBinding'],
  },
  { receivers: BEAN_MANAGERS, names: ['getReference', 'getInjectableReference', 'createInstance'] },
  { receivers: CDI_TYPES, names: ['select'] },
  { receivers: JNDI_CONTEXTS, names: ['lookup', 'lookupLink'] },
  { receivers: KOIN_RECEIVERS, names: [...KOIN_LOOKUPS, 'getAll'] },
];

export const PRODUCERS = new Map([
  ['com.google.inject.Guice.createInjector', GUICE_INJECTOR],
  ...CDI_TYPES.map((type) => [`${type}.current`, type]),
  ...JNDI_CONTEXTS.map((type) => [type, type]),
]);

export function functionApi(name, owner) {
  return FUNCTION_APIS.find((api) => api.name === name && api.owners.includes(owner));
}

export function staticApi(name, owner) {
  return STATIC_APIS.find((api) => api.owner === owner && api.names.includes(name));
}

export function receiverApi(name, receiverTypes) {
  return RECEIVER_APIS.find(
    (api) => api.names.includes(name) && api.receivers.some((type) => receiverTypes.includes(type)),
  );
}

export const KOIN_COMPONENTS = [
  'org.koin.core.component.KoinComponent',
  'org.koin.core.component.KoinScopeComponent',
];
