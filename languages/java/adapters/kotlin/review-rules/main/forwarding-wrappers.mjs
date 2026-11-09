import { append, compactType } from '../kotlin-facts.mjs';
import { declaredNames, springManagedOwner } from '../spring/spring-names.mjs';
import {
  declarationOf,
  functionKind,
  reaches,
  typeAliasNames,
} from './unused-options/call-reach.mjs';

export const FORWARDING_RULE = 'StaticForwardingWrapper';

const MESSAGE = `This function only passes its parameters, in order, to another function. Call that function directly where this one is used and delete the wrapper. Factories named of or from and copies such as List.copyOf are allowed.`;
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
const TYPE_QUALIFIER = new RegExp(`^(?:[a-z_]\\w*\\.)*${TYPE_NAME}(?:\\.${TYPE_NAME})*$`, 'u');
const STATIC_OWNERS = new Set(['object', 'companion']);

function ownerKinds(file, declared) {
  return {
    kinds: new Map(file.classes.map((klass) => [klass.qualified, klass.kind])),
    managed: springManagedOwner(file, declared),
  };
}

function isStaticLike(fn, owners) {
  if (fn.owner === '') {
    return true;
  }
  return STATIC_OWNERS.has(owners.kinds.get(fn.owner)) && !owners.managed(fn.owner);
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

function targetsOf(files, declared) {
  const targets = new Map();
  for (const file of files) {
    const owners = ownerKinds(file, declared);
    for (const fn of file.functions.filter(
      (entry) => !entry.local && isStaticLike(entry, owners),
    )) {
      const kind = functionKind(file, fn.owner);
      append(targets, fn.name, { fn, declaration: declarationOf(file, { ...fn, kind }) });
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

function forwardsTo(fn, file, { targets, typeAliases }) {
  const { qualifier } = fn.forward;
  const named = (targets.get(fn.forward.name) ?? []).filter(({ declaration }) =>
    reaches({ file, qualifier, typeAliases }, declaration),
  );
  return qualifier !== undefined && named.length === 0
    ? true
    : named.some((target) => sameSignature(fn, target.fn));
}

export function forwardingWrapperFindings(files, { finding, declaredIn = files }) {
  const main = files.filter(({ test }) => !test);
  const declared = declaredNames(declaredIn);
  const targets = {
    targets: targetsOf(
      declaredIn.filter(({ test }) => !test),
      declared,
    ),
    typeAliases: typeAliasNames(declaredIn),
  };
  return main.flatMap((file) => {
    const owners = ownerKinds(file, declared);
    return file.functions
      .filter((fn) => candidate(fn, owners) && passesInOrder(fn) && forwardsTo(fn, file, targets))
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
