import { has, report, returnTypeOf, symbolOf } from '../spring-scopes.mts';
import { BEAN, group, LAZY, VALUE } from '../spring-types.mts';
import type { FunctionFact, ParameterFact, Reported, SpringView } from '../typed/spring-shapes.mts';

const SPRING = 'org.springframework';
const CONFIG = `${SPRING}.beans.factory.config`;
const POST_PROCESSOR_TYPES = group(
  [
    'BeanPostProcessor',
    'BeanFactoryPostProcessor',
    'InstantiationAwareBeanPostProcessor',
    'SmartInstantiationAwareBeanPostProcessor',
    'DestructionAwareBeanPostProcessor',
    'CustomEditorConfigurer',
    'CustomScopeConfigurer',
  ].map((name) => `${CONFIG}.${name}`),
  [
    `${SPRING}.beans.factory.support.BeanDefinitionRegistryPostProcessor`,
    `${SPRING}.beans.factory.support.MergedBeanDefinitionPostProcessor`,
    `${SPRING}.beans.factory.annotation.CustomAutowireConfigurer`,
    `${SPRING}.context.support.PropertySourcesPlaceholderConfigurer`,
    `${SPRING}.context.event.EventListenerMethodProcessor`,
    `${SPRING}.dao.annotation.PersistenceExceptionTranslationPostProcessor`,
    `${SPRING}.scheduling.annotation.AsyncAnnotationBeanPostProcessor`,
    `${SPRING}.validation.beanvalidation.MethodValidationPostProcessor`,
  ],
);
const PROPERTIES_BINDING = group([
  `${SPRING}.boot.context.properties.ConfigurationPropertiesBinding`,
]);
const JVM_STATIC = group(['kotlin.jvm.JvmStatic']);
const SAFE_PARAMETERS = group([
  `${SPRING}.core.env.Environment`,
  `${SPRING}.core.env.ConfigurableEnvironment`,
  `${SPRING}.beans.factory.ObjectProvider`,
  `${SPRING}.beans.factory.BeanFactory`,
  `${SPRING}.context.ApplicationContext`,
]);
const OBJECT_PROVIDER = group([`${SPRING}.beans.factory.ObjectProvider`]);
const ITERATING = new Set([
  'stream',
  'iterator',
  'spliterator',
  'forEach',
  'forEachIndexed',
  'onEach',
  'map',
  'mapNotNull',
  'flatMap',
  'filter',
  'fold',
  'toList',
  'toSet',
  'asSequence',
]);
const TYPE_NAME = /^[A-Z]/u;

function beanType(view: SpringView, fn: FunctionFact): string | undefined {
  const declared = returnTypeOf(view, fn);
  if (declared !== undefined) {
    return declared;
  }
  const call = fn.expressionBody === true ? fn.forward : undefined;
  return call !== undefined && call.qualifier === undefined && TYPE_NAME.test(call.name)
    ? call.name
    : undefined;
}

function postProcessorBean(view: SpringView, fn: FunctionFact): boolean {
  const type = beanType(view, fn);
  return (
    has(view, fn, PROPERTIES_BINDING) ||
    (type !== undefined && view.extendsType(type, POST_PROCESSOR_TYPES))
  );
}

function staticBean(view: SpringView, fn: FunctionFact): boolean {
  return view.classes.get(fn.owner)?.kind === 'companion' && has(view, fn, JVM_STATIC);
}

function createsEarly(view: SpringView, parameter: ParameterFact): boolean {
  return !(
    has(view, parameter, LAZY) ||
    has(view, parameter, VALUE) ||
    view.is(parameter.type, SAFE_PARAMETERS)
  );
}

function staticPostProcessorBeans(view: SpringView): Reported[] {
  return view.file.functions
    .filter((fn) => has(view, fn, BEAN) && postProcessorBean(view, fn))
    .filter(
      (fn) =>
        !staticBean(view, fn) || fn.parameters.some((parameter) => createsEarly(view, parameter)),
    )
    .map((fn) => report('SpringStaticPostProcessorBean', fn, `${fn.owner}.${fn.name}`));
}

function provider(
  view: SpringView,
  scopeId: number | undefined,
  text: string | undefined,
): boolean {
  const type = text === undefined ? undefined : view.typeOf(scopeId, text);
  return type !== undefined && view.is(type, OBJECT_PROVIDER);
}

function orderedProviders(view: SpringView): Reported[] {
  const calls = view.file.invocations
    .filter(
      (invocation) =>
        ITERATING.has(invocation.name) && provider(view, invocation.scope, invocation.receiver),
    )
    .map((invocation) =>
      report(
        'SpringOrderedProvider',
        invocation,
        symbolOf(view, invocation.scope, invocation.name),
      ),
    );
  const loops = view.file.scopes
    .filter(({ k, condition }) => k === 'foreach' && condition === 'for')
    .filter((scope) => provider(view, scope.parent, scope.range))
    .map((scope) => report('SpringOrderedProvider', scope, symbolOf(view, scope.parent, 'for')));
  return [...calls, ...loops];
}

export const WIRING_RULES = [staticPostProcessorBeans, orderedProviders];
