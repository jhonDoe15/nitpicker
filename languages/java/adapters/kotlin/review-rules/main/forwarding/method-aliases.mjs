import { compactType } from '../../kotlin-facts.mjs';

export const METHOD_ALIAS_RULE = 'ForwardingMethodAlias';

const MESSAGE = `This method only passes its parameters, in order, to another method of the same class. Call that method directly and delete the alias.`;
const RENAME_MESSAGE = `This method only passes its parameters, in order, to a less visible method of the same class. Rename that method to this method's name and delete the alias.`;
const SKIPPED_NAMES = new Set(['of', 'from', 'invoke', 'copy']);
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
const STATIC_OWNERS = new Set(['object', 'companion']);
const MEMBER_OWNERS = new Set(['class', 'enum', 'object', 'companion']);

function memberOwners(file) {
  return new Map(
    file.classes
      .filter((klass) => !klass.local && MEMBER_OWNERS.has(klass.kind))
      .map((klass) => [klass.qualified, klass]),
  );
}

function hasModifier(fn, name) {
  return fn.modifiers.includes(name);
}

function isMemberOf(fn, owners) {
  const owner = owners.get(fn.owner);
  return (
    owner !== undefined && (!STATIC_OWNERS.has(owner.kind) || fn.forward?.qualifier === 'this')
  );
}

function isCandidate(fn, owners) {
  return (
    isMemberOf(fn, owners) &&
    !fn.local &&
    fn.annotations.length === 0 &&
    fn.parameters.every(({ annotations }) => annotations.length === 0) &&
    !fn.typeParameters &&
    fn.receiver === undefined &&
    fn.parameters.length > 0 &&
    fn.forward !== undefined &&
    fn.forward !== null &&
    !SKIPPED_NAMES.has(fn.name) &&
    !fn.modifiers.some((modifier) => SKIPPED_MODIFIERS.has(modifier)) &&
    fn.parameters.every(({ vararg, default: hasDefault }) => !vararg && !hasDefault)
  );
}

function passesInOrder(fn) {
  const { forward } = fn;
  return (
    !forward.typeArguments &&
    forward.name !== fn.name &&
    (forward.qualifier === undefined || forward.qualifier === 'this') &&
    forward.arguments.length === fn.parameters.length &&
    forward.arguments.every(
      (argument, index) =>
        !argument.spread &&
        !argument.lambda &&
        argument.text === fn.parameters[index].name &&
        (argument.name === undefined || argument.name === fn.parameters[index].name),
    )
  );
}

function resultType(fn) {
  if (fn.returnType !== undefined) {
    return compactType(fn.returnType);
  }
  return fn.expressionBody === true ? undefined : 'Unit';
}

function sameResult(fn, target) {
  const own = resultType(fn);
  return own === undefined || own === resultType(target);
}

function isPlainTarget(target) {
  return (
    target.receiver === undefined &&
    !target.typeParameters &&
    !hasModifier(target, 'abstract') &&
    !hasModifier(target, 'inline') &&
    target.parameters.every(({ vararg, default: hasDefault }) => !vararg && !hasDefault)
  );
}

function sameSignature(fn, target) {
  return (
    isPlainTarget(target) &&
    hasModifier(fn, 'suspend') === hasModifier(target, 'suspend') &&
    target.parameters.length === fn.parameters.length &&
    target.parameters.every(
      (parameter, index) => compactType(parameter.type) === compactType(fn.parameters[index].type),
    ) &&
    sameResult(fn, target)
  );
}

function siblingsNamed(file, fn, name) {
  return file.functions.filter(
    (other) => !other.local && other.owner === fn.owner && other.name === name,
  );
}

function isAlias(file, fn, owners) {
  return isCandidate(fn, owners) && passesInOrder(fn) && aliasTarget(file, fn) !== undefined;
}

function aliasTarget(file, fn) {
  const [target, ...others] = siblingsNamed(file, fn, fn.forward.name);
  return target !== undefined &&
    others.length === 0 &&
    siblingsNamed(file, fn, fn.name).length === 1 &&
    sameSignature(fn, target)
    ? target
    : undefined;
}

function isLaterOfMutual({ file, owners }, fn, target) {
  return (
    !(isAlias(file, target, owners) && target.forward.name === fn.name) || target.line < fn.line
  );
}

function visibilityRank(fn) {
  if (fn.visibility === 'private') {
    return 2;
  }
  return fn.visibility === 'internal' || hasModifier(fn, 'protected') ? 1 : 0;
}

function isMoreVisible(fn, target) {
  return visibilityRank(fn) < visibilityRank(target);
}

export function methodAliasFindings(files, { finding }) {
  return files
    .filter(({ test }) => !test)
    .flatMap((file) => {
      const owners = memberOwners(file);
      return file.functions
        .filter((fn) => isCandidate(fn, owners) && passesInOrder(fn))
        .map((fn) => [fn, aliasTarget(file, fn)])
        .filter(
          ([fn, target]) => target !== undefined && isLaterOfMutual({ file, owners }, fn, target),
        )
        .map(([fn, target]) =>
          finding({
            rule: METHOD_ALIAS_RULE,
            file: file.file,
            line: fn.line,
            symbol: `${fn.owner}.${fn.name}`,
            message: isMoreVisible(fn, target) ? RENAME_MESSAGE : MESSAGE,
          }),
        );
    });
}
