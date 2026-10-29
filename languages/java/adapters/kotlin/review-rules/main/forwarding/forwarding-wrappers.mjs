import { annotationNamed, append, compactType } from '../../kotlin-facts.mjs';

export const FORWARDING_RULE = 'StaticForwardingWrapper';

const MESSAGE = `This function only passes its parameters, in order, to another function. Call that function directly where this one is used and delete the wrapper. Factories named of or from and copies such as List.copyOf are allowed.`;
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
const SKIPPED_MODIFIERS = new Set([
  'override',
  'operator',
  'infix',
  'inline',
  'open',
  'abstract',
  'actual',
  'expect',
]);
const COPY_PREFIX = /^(?:copyOf|unmodifiable|synchronized|checked)/u;
const TYPE_NAME = String.raw`[A-Z][A-Z0-9_]*[a-z]\w*`;
const TYPE_QUALIFIER = new RegExp(`^${TYPE_NAME}(?:\\.${TYPE_NAME})*$`, 'u');
const STATIC_OWNERS = new Set(['object', 'companion']);

function ownerKinds(file) {
  return new Map(file.classes.map((klass) => [klass.qualified, klass]));
}

function ancestorsOf(qualified) {
  const parts = qualified.split('.');
  return parts.map((_, index) => parts.slice(0, index + 1).join('.'));
}

function isStaticLike(fn, owners) {
  if (fn.owner === '') {
    return true;
  }
  const owner = owners.get(fn.owner);
  return (
    owner !== undefined &&
    STATIC_OWNERS.has(owner.kind) &&
    !ancestorsOf(fn.owner).some((qualified) =>
      annotationNamed(owners.get(qualified)?.annotations ?? [], SPRING_STEREOTYPES),
    )
  );
}

function candidate(fn, owners) {
  return (
    !fn.local &&
    fn.annotations.length === 0 &&
    !fn.typeParameters &&
    fn.receiver === undefined &&
    fn.parameters.length > 0 &&
    fn.forward !== undefined &&
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
        !argument.spread &&
        !argument.lambda &&
        argument.text === fn.parameters[index].name &&
        (argument.name === undefined || argument.name === fn.parameters[index].name),
    ) &&
    (forward.qualifier === undefined
      ? forward.name !== fn.name
      : TYPE_QUALIFIER.test(forward.qualifier))
  );
}

function targetsOf(files) {
  const targets = new Map();
  for (const file of files) {
    const owners = ownerKinds(file);
    for (const fn of file.functions.filter(
      (entry) => !entry.local && isStaticLike(entry, owners),
    )) {
      append(targets, fn.name, fn);
    }
  }
  return targets;
}

function sameSignature(fn, target) {
  return (
    target !== fn &&
    target.receiver === undefined &&
    target.parameters.length === fn.parameters.length &&
    target.parameters.every(
      (parameter, index) => compactType(parameter.type) === compactType(fn.parameters[index].type),
    ) &&
    (fn.returnType === undefined ||
      target.returnType === undefined ||
      compactType(fn.returnType) === compactType(target.returnType))
  );
}

function ownerNames(target) {
  const parts = target.owner.split('.');
  return parts.at(-1) === 'Companion' ? [parts.slice(0, -1).at(-1), 'Companion'] : [parts.at(-1)];
}

function forwardsTo(fn, targets) {
  const qualifier = fn.forward.qualifier?.split('.').at(-1);
  const named = (targets.get(fn.forward.name) ?? []).filter(
    (target) => qualifier === undefined || ownerNames(target).includes(qualifier),
  );
  return qualifier !== undefined && named.length === 0
    ? true
    : named.some((target) => sameSignature(fn, target));
}

export function forwardingWrapperFindings(files, { finding, declaredIn = files }) {
  const main = files.filter(({ test }) => !test);
  const targets = targetsOf(declaredIn.filter(({ test }) => !test));
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
