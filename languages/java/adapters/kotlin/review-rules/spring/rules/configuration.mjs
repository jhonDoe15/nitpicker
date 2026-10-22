import { isSecretKey } from '../../../../spring/spring-secrets.mjs';
import { annotationIn, stringValue } from '../spring-names.mjs';
import { entriesOf, symbolOf } from '../spring-scopes.mjs';
import {
  BEAN,
  CONFIG_INITIALIZERS,
  CONFIGURATION,
  CONFIGURATION_CLASSES,
  DEFAULT_VALUE,
  PROFILE,
  PROPERTY_RESOLVERS,
  STEREOTYPES,
  VALUE,
} from '../spring-types.mjs';

const JVM_KEY = /^(?:java|user|os|file|line|path|javax|jdk|sun|com\.sun|http|https|ftp)\.|^socks/u;
const SECRET_DEFAULT = /^\$\{([^}:]+):([^}]*)\}$/u;
function isFallback(value) {
  return value !== '' && !/^[#$]/u.test(value);
}

function parametersWithOwners(view) {
  return [
    ...view.file.classes.flatMap((declared) =>
      declared.primaryParameters.map((parameter) => ({ parameter, owner: declared.qualified })),
    ),
    ...view.file.functions.flatMap((fn) =>
      fn.parameters.map((parameter) => ({ parameter, owner: fn.owner, fn })),
    ),
  ];
}

function configurationClass(view, qualified) {
  const declared = view.classes.get(qualified.split('.')[0]) ?? view.classes.get(qualified);
  return (
    declared !== undefined &&
    (annotationIn(view.resolve, declared.annotations, CONFIGURATION_CLASSES) !== undefined ||
      declared.supers.some((type) => view.is(type, CONFIG_INITIALIZERS)))
  );
}

function stereotype(view, qualified) {
  const declared = view.classes.get(qualified);
  return (
    declared !== undefined &&
    annotationIn(view.resolve, declared.annotations, STEREOTYPES) !== undefined
  );
}

function valueParameters(view) {
  return parametersWithOwners(view)
    .filter(
      ({ parameter }) => annotationIn(view.resolve, entriesOf(parameter), VALUE) !== undefined,
    )
    .filter(({ owner }) => {
      const declared = view.classes.get(owner);
      return (
        declared === undefined ||
        annotationIn(view.resolve, declared.annotations, CONFIGURATION_CLASSES) === undefined
      );
    })
    .map(({ parameter, owner }) => ({
      rule: 'SpringTypedConfiguration',
      line: parameter.line,
      symbol: `${owner}.${parameter.name}`,
    }));
}

function propertyReads(view) {
  return view.file.invocations.flatMap((invocation) => {
    const owner = view.chain(invocation.scope).findLast(({ k }) => k === 'class')?.qualified;
    const fn = view.functionAt(invocation.scope);
    const key = stringValue(invocation.arguments[0]?.text);
    const system =
      invocation.name === 'getProperty' &&
      invocation.receiver !== undefined &&
      view.is(invocation.receiver, new Set(['java.lang.System'])) &&
      !(key !== undefined && JVM_KEY.test(key)) &&
      !(owner !== undefined && configurationClass(view, owner)) &&
      fn?.name !== 'main';
    const environment =
      ['getProperty', 'getRequiredProperty'].includes(invocation.name) &&
      view
        .chain(invocation.scope)
        .some(({ k, qualified }) => k === 'class' && stereotype(view, qualified)) &&
      view.is(view.typeOf(invocation.scope, invocation.receiver), PROPERTY_RESOLVERS);
    return system || environment
      ? [
          {
            rule: 'SpringTypedConfiguration',
            line: invocation.line,
            symbol: symbolOf(view, invocation.scope, invocation.name),
          },
        ]
      : [];
  });
}

function secretFallback(key, value) {
  return key !== undefined && value !== undefined && isSecretKey(key) && isFallback(value);
}

function declarationsWithEntries(view) {
  return [
    ...view.file.properties.map((entry) => ({ entry, owner: entry.owner })),
    ...view.file.functions.map((entry) => ({ entry, owner: entry.owner })),
    ...parametersWithOwners(view).map(({ parameter, owner }) => ({ entry: parameter, owner })),
  ];
}

function secretDefaults(view) {
  const annotated = declarationsWithEntries(view).flatMap(({ entry, owner }) => {
    const value = annotationIn(view.resolve, entriesOf(entry), VALUE);
    const placeholder = SECRET_DEFAULT.exec(stringValue(value?.arguments[0]?.text) ?? '');
    const defaulted = annotationIn(view.resolve, entriesOf(entry), DEFAULT_VALUE);
    const literal = stringValue(defaulted?.arguments[0]?.text ?? '');
    return (placeholder !== null && secretFallback(placeholder[1], placeholder[2])) ||
      (defaulted !== undefined && secretFallback(entry.name, literal))
      ? [{ rule: 'SpringValueSecretDefault', line: entry.line, symbol: `${owner}.${entry.name}` }]
      : [];
  });
  const reads = view.file.invocations.filter(
    (invocation) =>
      invocation.name === 'getProperty' &&
      invocation.arguments.length === 2 &&
      secretFallback(
        stringValue(invocation.arguments[0].text),
        stringValue(invocation.arguments[1].text),
      ) &&
      view.is(view.typeOf(invocation.scope, invocation.receiver), PROPERTY_RESOLVERS),
  );
  return [
    ...annotated,
    ...reads.map((invocation) => ({
      rule: 'SpringValueSecretDefault',
      line: invocation.line,
      symbol: symbolOf(view, invocation.scope, invocation.name),
    })),
  ];
}

function profiles(view) {
  const classes = view.file.classes
    .filter((declared) => annotationIn(view.resolve, declared.annotations, PROFILE) !== undefined)
    .filter(
      (declared) => annotationIn(view.resolve, declared.annotations, CONFIGURATION) === undefined,
    )
    .map((declared) => ({
      rule: 'SpringProfileOnConfiguration',
      line: declared.line,
      symbol: declared.qualified,
    }));
  const functions = view.file.functions
    .filter((fn) => annotationIn(view.resolve, entriesOf(fn), PROFILE) !== undefined)
    .filter((fn) => annotationIn(view.resolve, entriesOf(fn), BEAN) === undefined)
    .map((fn) => ({
      rule: 'SpringProfileOnConfiguration',
      line: fn.line,
      symbol: `${fn.owner}.${fn.name}`,
    }));
  return [...classes, ...functions];
}

export const CONFIGURATION_RULES = [valueParameters, propertyReads, secretDefaults, profiles];
