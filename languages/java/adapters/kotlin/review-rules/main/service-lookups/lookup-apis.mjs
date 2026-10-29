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
const JNDI_CONTEXTS = ['javax.naming.Context', 'javax.naming.InitialContext'];
const SPRING_JNDI = [
  'org.springframework.jndi.JndiTemplate',
  'org.springframework.jndi.JndiLocatorDelegate',
];

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
export const CONFIGURATION_ANNOTATIONS = [
  'org.springframework.context.annotation.Configuration',
  'org.springframework.boot.SpringBootConfiguration',
  'org.springframework.boot.autoconfigure.SpringBootApplication',
];
export const BEAN_ANNOTATION = 'org.springframework.context.annotation.Bean';
export const KTOR_APPLICATION = 'io.ktor.server.application.Application';
export const KOIN_SCOPE = 'org.koin.core.scope.Scope';
export const ROOT_SUPERTYPES = [
  ...['Activity', 'Application', 'Service', 'IntentService', 'Fragment', 'DialogFragment'].map(
    (name) => `android.app.${name}`,
  ),
  'android.content.BroadcastReceiver',
  'android.content.ContentProvider',
  'androidx.activity.ComponentActivity',
  'androidx.appcompat.app.AppCompatActivity',
  'androidx.fragment.app.Fragment',
  'androidx.fragment.app.FragmentActivity',
  'androidx.fragment.app.DialogFragment',
  'androidx.lifecycle.LifecycleService',
  'androidx.multidex.MultiDexApplication',
  'jakarta.enterprise.inject.spi.Extension',
  'javax.enterprise.inject.spi.Extension',
];
const DEFINITION_HOSTS = new Set([
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

const FUNCTION_APIS = [
  ...KOIN_LOOKUPS.map((name) => ({ name, owners: KOIN_OWNERS })),
  { name: 'getKoin', owners: [...KOIN_OWNERS, 'org.koin.compose'] },
  { name: 'koinInject', owners: ['org.koin.compose', 'org.koin.androidx.compose'], compose: true },
  {
    name: 'koinViewModel',
    owners: ['org.koin.compose.viewmodel', 'org.koin.androidx.compose'],
    compose: true,
  },
];
const STATIC_APIS = [
  { owner: 'org.koin.core.context.GlobalContext', names: ['get', 'getOrNull'], koin: true },
  { owner: 'org.koin.mp.KoinPlatform', names: ['getKoin'], koin: true },
  { owner: 'org.koin.java.KoinJavaComponent', names: [...KOIN_LOOKUPS, 'getKoin'], koin: true },
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
  { receivers: SPRING_JNDI, names: ['lookup'] },
  { receivers: KOIN_RECEIVERS, names: [...KOIN_LOOKUPS, 'getAll'], koin: true },
];

const PRODUCERS = new Map([
  ['com.google.inject.Guice.createInjector', GUICE_INJECTOR],
  ...CDI_TYPES.map((type) => [`${type}.current`, type]),
  ...[...JNDI_CONTEXTS, ...SPRING_JNDI].map((type) => [type, type]),
]);

export function isDefinitionHost(name) {
  return DEFINITION_HOSTS.has(name);
}

export function producedType(producer) {
  return PRODUCERS.get(producer);
}

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
