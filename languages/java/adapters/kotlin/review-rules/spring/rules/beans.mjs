import { annotationIn, argumentOf } from '../spring-names.mjs';
import { has, lockedScope, startupScopes } from '../spring-scopes.mjs';
import {
  AUTOWIRED,
  BEAN,
  BEAN_FACTORIES,
  BOOT_APPLICATION,
  COMPONENT_SCAN,
  CONFIG_INITIALIZERS,
  CONFIGURATION,
  INJECT,
  LAZY,
  LOCATOR_INTERFACES,
  PERSISTENCE_INJECTION,
  POST_PROCESSORS,
  RESOURCE,
  SCOPE,
  SINGLETON_SCOPES,
  STEREOTYPES,
  VALUE,
} from '../spring-types.mjs';

const INJECTION = new Set([...AUTOWIRED, ...INJECT, ...RESOURCE]);
const CONSTRUCTOR_INJECTION = new Set([...AUTOWIRED, ...INJECT]);
const PLAIN_COLLECTIONS = new Set([
  'HashMap',
  'LinkedHashMap',
  'TreeMap',
  'ArrayList',
  'LinkedList',
  'HashSet',
  'LinkedHashSet',
  'TreeSet',
  'ArrayDeque',
  'mutableMapOf',
  'mutableListOf',
  'mutableSetOf',
  'hashMapOf',
  'linkedMapOf',
  'sortedMapOf',
  'arrayListOf',
  'hashSetOf',
  'linkedSetOf',
  'sortedSetOf',
]);
const MUTATORS = new Set([
  'add',
  'addAll',
  'put',
  'putAll',
  'remove',
  'removeIf',
  'removeAll',
  'retainAll',
  'clear',
  'putIfAbsent',
  'computeIfAbsent',
  'computeIfPresent',
  'compute',
  'merge',
  'replace',
  'replaceAll',
  'push',
  'pop',
  'poll',
  'offer',
  'addFirst',
  'addLast',
  'removeFirst',
  'removeLast',
  'getOrPut',
  'set',
  'plusAssign',
  'minusAssign',
]);
const THIS = /^this\./u;
const SINGLETON = /"singleton"|SCOPE_SINGLETON/u;

function classHas(view, declared, fqns) {
  return annotationIn(view.resolve, declared.annotations, fqns) !== undefined;
}

function report(rule, declaration, owner) {
  const name = declaration.qualified === undefined ? declaration.name : undefined;
  return { rule, line: declaration.line, symbol: [owner, name].filter(Boolean).join('.') };
}

function constructorInjection(view) {
  const { file } = view;
  const properties = file.properties
    .filter((property) => has(view, property, INJECTION) || has(view, property, VALUE))
    .map((property) => report('SpringConstructorInjection', property, property.owner));
  const functions = file.functions
    .filter((fn) => fn.name !== '<init>')
    .filter((fn) => has(view, fn, INJECTION) || (has(view, fn, VALUE) && !has(view, fn, BEAN)))
    .map((fn) => report('SpringConstructorInjection', fn, fn.owner));
  const constructors = file.classes.flatMap((declared) => {
    const secondary = view.functionsOf(declared.qualified).filter(({ name }) => name === '<init>');
    const primary =
      secondary.length === 0 &&
      annotationIn(view.resolve, declared.constructorAnnotations ?? [], CONSTRUCTOR_INJECTION);
    const onlySecondary =
      secondary.length === 1 &&
      declared.primaryParameters.length === 0 &&
      has(view, secondary[0], CONSTRUCTOR_INJECTION);
    return primary || onlySecondary
      ? [report('SpringConstructorInjection', declared, declared.qualified)]
      : [];
  });
  return [...properties, ...functions, ...constructors];
}

function beans(view) {
  return view.file.classes.filter((declared) => classHas(view, declared, STEREOTYPES));
}

function immutableBeans(view) {
  return beans(view).flatMap((declared) => [
    ...declared.primaryParameters
      .filter(({ property }) => property === 'var')
      .map((parameter) => report('SpringImmutableBeans', parameter, declared.qualified)),
    ...view
      .memberPropertiesOf(declared.qualified)
      .filter((property) => property.var && !has(view, property, PERSISTENCE_INJECTION))
      .map((property) => report('SpringImmutableBeans', property, declared.qualified)),
  ]);
}

function serviceLocator(view) {
  return view.file.classes.flatMap((declared) => {
    const aware = declared.supers.some((type) => view.is(type, LOCATOR_INTERFACES))
      ? [report('SpringNoServiceLocator', declared, declared.qualified)]
      : [];
    if (
      classHas(view, declared, CONFIGURATION) ||
      classHas(view, declared, BOOT_APPLICATION) ||
      declared.supers.some(
        (type) => view.is(type, POST_PROCESSORS) || view.is(type, CONFIG_INITIALIZERS),
      )
    ) {
      return aware;
    }
    const typed = [
      ...declared.primaryParameters,
      ...view.propertiesOf(declared.qualified),
      ...view.functionsOf(declared.qualified).flatMap(({ parameters }) => parameters),
    ].filter(({ type }) => view.is(type, BEAN_FACTORIES));
    return [
      ...aware,
      ...typed.map((entry) => report('SpringNoServiceLocator', entry, declared.qualified)),
    ];
  });
}

function lazyInjection(view) {
  const { file } = view;
  return [
    ...file.properties.map((entry) => ({ entry, owner: entry.owner })),
    ...file.classes.flatMap((declared) =>
      declared.primaryParameters.map((entry) => ({ entry, owner: declared.qualified })),
    ),
    ...file.functions.flatMap((fn) =>
      fn.parameters.map((entry) => ({ entry, owner: `${fn.owner}.${fn.name}` })),
    ),
  ]
    .filter(({ entry }) => has(view, entry, LAZY))
    .map(({ entry, owner }) => report('SpringNoLazyInjection', entry, owner));
}

function configurationAnnotations(view) {
  return view.file.classes.flatMap((declared) => {
    const configuration = annotationIn(view.resolve, declared.annotations, CONFIGURATION);
    const boot = annotationIn(view.resolve, declared.annotations, BOOT_APPLICATION);
    const scan = annotationIn(view.resolve, declared.annotations, COMPONENT_SCAN);
    const lite =
      configuration !== undefined && argumentOf(configuration, 'proxyBeanMethods') !== 'false';
    const scanned =
      scan !== undefined ||
      (boot !== undefined &&
        boot.arguments.some(({ name }) =>
          ['scanBasePackages', 'scanBasePackageClasses'].includes(name),
        ));
    return [
      ...(lite ? [report('SpringLiteConfiguration', declared, declared.qualified)] : []),
      ...(scanned ? [report('SpringNoComponentScan', declared, declared.qualified)] : []),
    ];
  });
}

function singletonBean(view, declared) {
  const scope = annotationIn(view.resolve, declared.annotations, SCOPE);
  return (
    !classHas(view, declared, SINGLETON_SCOPES) &&
    (scope === undefined || scope.arguments.some(({ text }) => SINGLETON.test(text)))
  );
}

function mutates(view, invocation, name) {
  const target = view.receiverOf(invocation);
  if (target === undefined || target.text.replace(THIS, '') !== name) {
    return false;
  }
  return THIS.test(target.text) || !view.declaresLocally(target.scope, name);
}

function collectionState(view) {
  const startup = startupScopes(view);
  return beans(view)
    .filter((declared) => singletonBean(view, declared))
    .flatMap((declared) =>
      view
        .memberPropertiesOf(declared.qualified)
        .filter((property) => !property.var && PLAIN_COLLECTIONS.has(property.initializer))
        .filter((property) =>
          view.file.invocations.some(
            (invocation) =>
              MUTATORS.has(invocation.name) &&
              mutates(view, invocation, property.name) &&
              view
                .chain(invocation.scope)
                .some(({ qualified }) => qualified === declared.qualified) &&
              !startup(invocation.scope) &&
              !lockedScope(view, invocation.scope),
          ),
        )
        .map((property) => report('SpringBeanCollectionState', property, declared.qualified)),
    );
}

export const BEAN_RULES = [
  constructorInjection,
  immutableBeans,
  serviceLocator,
  lazyInjection,
  configurationAnnotations,
  collectionState,
];
