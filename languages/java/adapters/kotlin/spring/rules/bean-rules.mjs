import { argumentValue } from '../syntax/kotlin-annotations.mjs';
import { callsIn } from '../syntax/kotlin-calls.mjs';
import { receiverMatches, typeMatches } from '../syntax/kotlin-receivers.mjs';
import { textOf } from '../syntax/kotlin-tree.mjs';
import {
  AUTOWIRED_OR_INJECT,
  AUTOWIRING,
  BEAN,
  COMPONENT_SCAN,
  CONFIGURATION,
  CONFIGURATION_LIKE,
  LAZY,
  PERSISTENCE_INJECTION,
  PROFILE,
  SPRING_BOOT_APPLICATION,
  STEREOTYPES,
  VALUE,
} from '../names/spring-annotations.mjs';
import {
  AWARE_INTERFACES,
  BEAN_FACTORIES,
  BEAN_PROCESSORS,
  PROPERTY_RESOLVERS,
} from '../names/spring-types.mjs';
import {
  classSymbolOf,
  defineRule,
  hasAnnotation,
  hitAt,
  hitOn,
  sitesOfType,
  symbolAround,
} from './rule-support.mjs';

const INJECTED_KINDS = new Set(['property', 'function']);
const TYPED_STEREOTYPES = new Set(
  [...STEREOTYPES].filter((name) => !/ControllerAdvice$/.test(name)),
);
const JVM_PROPERTY = /^"(?:java|user|os|file|line|path)\./;

function fieldInjections(file) {
  return [
    ...sitesOfType(file, AUTOWIRING).filter((site) => INJECTED_KINDS.has(site.kind)),
    ...sitesOfType(file, VALUE).filter(
      (site) =>
        site.kind === 'property' ||
        (site.kind === 'function' && !hasAnnotation(file, site.decl, BEAN)),
    ),
  ];
}

function onlyConstructorInjections(file) {
  return sitesOfType(file, AUTOWIRED_OR_INJECT).filter(
    (site) => site.kind === 'constructor' && site.owner.constructors.length === 1,
  );
}

const constructorInjection = defineRule(
  'SpringConstructorInjection',
  'Inject through the constructor into private val properties. Do not put @Autowired, @Inject, @Resource or @Value on properties or setters, and do not annotate the only constructor.',
  (file) => [...fieldInjections(file), ...onlyConstructorInjections(file)].map(hitAt),
);

const immutableBeans = defineRule(
  'SpringImmutableBeans',
  'Make this bean property a val. Beans are shared singletons, so keep per-call state in locals.',
  (file) =>
    file.classes
      .filter((declaration) => declaration.kind === 'class')
      .filter((declaration) => hasAnnotation(file, declaration, STEREOTYPES))
      .flatMap((declaration) =>
        declaration.properties
          .filter((property) => property.mutable)
          .filter((property) => !hasAnnotation(file, property, PERSISTENCE_INJECTION))
          .map((property) =>
            hitOn(property.node, `${classSymbolOf(declaration)}.${property.name}`),
          ),
      ),
);

function locatorTypes(file, declaration) {
  const owner = classSymbolOf(declaration);
  function parameters(members, scope) {
    return members.flatMap((member) =>
      member.params
        .filter((parameter) => !parameter.property)
        .map((parameter) => ({
          type: parameter.type,
          symbol: `${owner}.${scope(member)}.${parameter.name}`,
        })),
    );
  }
  return [
    ...declaration.properties.map((property) => ({
      type: property.type,
      symbol: `${owner}.${property.name}`,
    })),
    ...parameters(declaration.constructors, () => '<init>'),
    ...parameters(declaration.functions, (member) => member.name),
  ].filter(({ type }) => typeMatches(file, type, BEAN_FACTORIES));
}

function isLocatorExempt(file, declaration) {
  return (
    hasAnnotation(file, declaration, new Set([...CONFIGURATION, ...SPRING_BOOT_APPLICATION])) ||
    declaration.supertypes.some(({ type }) => file.resolver.matches(type.name, BEAN_PROCESSORS))
  );
}

const serviceLocator = defineRule(
  'SpringNoServiceLocator',
  'Inject the bean you need through the constructor instead of looking it up in the ApplicationContext or BeanFactory. Use ObjectProvider for optional or prototype beans.',
  (file) =>
    file.classes.flatMap((declaration) => [
      ...(isLocatorExempt(file, declaration) ? [] : locatorTypes(file, declaration)).map(
        ({ type, symbol }) => hitOn(type.node, symbol),
      ),
      ...declaration.supertypes
        .filter(({ type }) => file.resolver.matches(type.name, AWARE_INTERFACES))
        .map(({ type }) => hitOn(type.node, `${classSymbolOf(declaration)}:${type.name}`)),
    ]),
);

const lazyInjection = defineRule(
  'SpringNoLazyInjection',
  'Remove @Lazy from this injection point. It hides a dependency cycle; break the cycle with a new component or an event instead.',
  (file) =>
    sitesOfType(file, LAZY)
      .filter((site) => site.kind === 'property' || site.kind === 'parameter')
      .map(hitAt),
);

const liteConfiguration = defineRule(
  'SpringLiteConfiguration',
  'Write @Configuration(proxyBeanMethods = false) and take dependencies as @Bean function parameters instead of calling other @Bean functions.',
  (file) =>
    sitesOfType(file, CONFIGURATION)
      .filter((site) => site.kind === 'class')
      .filter((site) => argumentValue(site.annotation, 'proxyBeanMethods')?.text !== 'false')
      .map(hitAt),
);

const componentScan = defineRule(
  'SpringNoComponentScan',
  'Put the @SpringBootApplication class in the top package and let it scan its own packages; do not add @ComponentScan or scanBasePackages.',
  (file) =>
    [
      ...sitesOfType(file, COMPONENT_SCAN),
      ...sitesOfType(file, SPRING_BOOT_APPLICATION).filter(
        ({ annotation }) =>
          argumentValue(annotation, 'scanBasePackages') !== undefined ||
          argumentValue(annotation, 'scanBasePackageClasses') !== undefined,
      ),
    ].map(hitAt),
);

function environmentCalls(file, declaration) {
  return callsIn(file.source, declaration.node)
    .filter((call) => !call.reference)
    .filter((call) => {
      const receiver = textOf(file.source, call.receiver);
      const first = textOf(file.source, call.arguments[0]);
      return (
        ((call.name === 'getenv' || call.name === 'getProperty') &&
          /^(?:java\.lang\.)?System$/.test(receiver) &&
          !JVM_PROPERTY.test(first)) ||
        (/^get(?:Required)?Property$/.test(call.name) &&
          receiverMatches({ file, scope: { owner: declaration } }, call, PROPERTY_RESOLVERS))
      );
    });
}

function valueOutsideConfiguration(file) {
  return sitesOfType(file, VALUE)
    .filter((site) => site.kind === 'parameter')
    .filter(
      (site) => site.owner === undefined || !hasAnnotation(file, site.owner, CONFIGURATION_LIKE),
    )
    .map(hitAt);
}

const typedConfiguration = defineRule(
  'SpringTypedConfiguration',
  'Read configuration through a @ConfigurationProperties class, not @Value, System.getenv, System.getProperty or Environment.getProperty.',
  (file) => [
    ...valueOutsideConfiguration(file),
    ...file.classes
      .filter((declaration) => hasAnnotation(file, declaration, TYPED_STEREOTYPES))
      .flatMap((declaration) =>
        environmentCalls(file, declaration).map((call) =>
          hitOn(call.node, `${symbolAround(declaration, call.node)}@${call.name}`),
        ),
      ),
  ],
);

const profileOnConfiguration = defineRule(
  'SpringProfileOnConfiguration',
  'Put @Profile only on a @Configuration class or a @Bean function, so profiles choose beans and never branch business code.',
  (file) =>
    sitesOfType(file, PROFILE)
      .filter(
        (site) =>
          (site.kind === 'class' && !hasAnnotation(file, site.decl, CONFIGURATION)) ||
          (site.kind === 'function' && !hasAnnotation(file, site.decl, BEAN)),
      )
      .map(hitAt),
);

export const BEAN_RULES = [
  constructorInjection,
  immutableBeans,
  serviceLocator,
  lazyInjection,
  liteConfiguration,
  componentScan,
  typedConfiguration,
  profileOnConfiguration,
];
