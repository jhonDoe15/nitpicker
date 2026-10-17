import { annotationNamed } from '../kotlin-facts.mjs';
import { exceptionSentence } from '../review-finding.mjs';

export const FORWARDING_RULE = 'StaticForwardingWrapper';

const MESSAGE = `This function only passes its parameters, in order, to another function with the same parameters. Call that function directly where this one is used and delete the wrapper. Factories named of or from are allowed. If the wrapper is intended (a public alias, or a name a framework looks up), ${exceptionSentence(FORWARDING_RULE)}`;
const SPRING_STEREOTYPES = new Set([
  'Component',
  'Service',
  'Repository',
  'Controller',
  'RestController',
  'ControllerAdvice',
  'RestControllerAdvice',
  'Configuration',
  'SpringBootApplication',
]);
const SKIPPED_NAMES = new Set(['main', 'valueOf', 'fromString', 'of', 'from', 'invoke', 'copy']);
const SKIPPED_MODIFIERS = new Set(['override', 'operator', 'infix', 'inline', 'open', 'abstract', 'actual', 'expect']);
const COPY_PREFIX = /^(?:copyOf|unmodifiable|synchronized|checked)/u;
const TYPE_QUALIFIER = /^[A-Z]\w*(?:\.[A-Z]\w*)*$/u;
const STATIC_OWNERS = new Set(['object', 'companion']);

function normalized(type) {
  return (type ?? '').replaceAll(/\s+/gu, '');
}

function ownerKinds(file) {
  return new Map(file.classes.map((klass) => [klass.qualified, klass]));
}

function isStaticLike(fn, owners) {
  if (fn.owner === '') {
    return true;
  }
  const owner = owners.get(fn.owner);
  return owner !== undefined && STATIC_OWNERS.has(owner.kind) && !annotationNamed(owner.annotations, SPRING_STEREOTYPES);
}

function candidate(fn, owners) {
  return (
    !fn.local &&
    fn.name !== null &&
    fn.annotations.length === 0 &&
    !fn.typeParameters &&
    fn.receiver === null &&
    fn.parameters.length > 0 &&
    fn.forward !== null &&
    !SKIPPED_NAMES.has(fn.name) &&
    !fn.modifiers.some((modifier) => SKIPPED_MODIFIERS.has(modifier)) &&
    fn.parameters.every(({ vararg, default: hasDefault }) => !vararg && !hasDefault) &&
    isStaticLike(fn, owners)
  );
}

function passesInOrder(fn) {
  const { forward } = fn;
  return (
    !forward.typeArguments &&
    !COPY_PREFIX.test(forward.name) &&
    forward.arguments.length === fn.parameters.length &&
    forward.arguments.every(
      (argument, index) =>
        !argument.spread && !argument.lambda && argument.text === fn.parameters[index].name &&
        (argument.name === null || argument.name === fn.parameters[index].name),
    ) &&
    (forward.qualifier === null ? forward.name !== fn.name : TYPE_QUALIFIER.test(forward.qualifier))
  );
}

function targetsOf(files) {
  const targets = new Map();
  for (const file of files) {
    const owners = ownerKinds(file);
    for (const fn of file.functions.filter((entry) => !entry.local && isStaticLike(entry, owners))) {
      targets.set(fn.name, [...(targets.get(fn.name) ?? []), fn]);
    }
  }
  return targets;
}

function sameSignature(fn, target) {
  return (
    target !== fn &&
    target.receiver === null &&
    target.parameters.length === fn.parameters.length &&
    target.parameters.every(
      (parameter, index) => normalized(parameter.type) === normalized(fn.parameters[index].type),
    ) &&
    (fn.returnType === null || target.returnType === null || normalized(fn.returnType) === normalized(target.returnType))
  );
}

function forwardsTo(fn, targets) {
  const qualifier = fn.forward.qualifier?.split('.').at(-1) ?? null;
  return (targets.get(fn.forward.name) ?? []).some(
    (target) =>
      sameSignature(fn, target) && (qualifier === null || target.owner.split('.').at(-1) === qualifier),
  );
}

export function forwardingWrapperFindings(files, { finding }) {
  const main = files.filter(({ test }) => !test);
  const targets = targetsOf(main);
  return main.flatMap((file) => {
    const owners = ownerKinds(file);
    return file.functions
      .filter((fn) => candidate(fn, owners) && passesInOrder(fn) && forwardsTo(fn, targets))
      .map((fn) => {
        const symbol = [fn.owner, fn.name].filter(Boolean).join('.');
        return finding({
          rule: FORWARDING_RULE,
          file: file.file,
          line: fn.line,
          symbol,
          message: MESSAGE,
        });
      });
  });
}
