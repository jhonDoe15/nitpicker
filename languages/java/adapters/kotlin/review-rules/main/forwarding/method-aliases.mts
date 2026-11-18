import type { ClassFact, FunctionFact, KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { ReviewFinding, RuleOptions } from '../../typed/review-finding-types.mts';
import { compactType } from '../../kotlin-facts.mts';
import { forwardsArguments, isPlainForwarder } from './forwarding-shape.mts';

export const METHOD_ALIAS_RULE = 'ForwardingMethodAlias';

const MESSAGE = `This method only passes its parameters, in order, to another method of the same class. Call that method directly and delete the alias.`;
const RENAME_MESSAGE = `This method only passes its parameters, in order, to a less visible method of the same class. Rename that method to this method's name and delete the alias.`;
const SKIPPED_NAMES = new Set(['of', 'from', 'invoke', 'copy']);
const STATIC_OWNERS = new Set(['object', 'companion']);
const MEMBER_OWNERS = new Set(['class', 'enum', 'object', 'companion']);

function memberOwners(file: KotlinFile): Map<string, ClassFact> {
  return new Map(
    file.classes
      .filter((klass) => !klass.local && MEMBER_OWNERS.has(klass.kind))
      .map((klass): [string, ClassFact] => [klass.qualified, klass]),
  );
}

function hasModifier(fn: FunctionFact, name: string): boolean {
  return fn.modifiers.includes(name);
}

function isMemberOf(fn: FunctionFact, owners: Map<string, ClassFact>): boolean {
  const owner = owners.get(fn.owner);
  return (
    owner !== undefined && (!STATIC_OWNERS.has(owner.kind) || fn.forward?.qualifier === 'this')
  );
}

function isCandidate(fn: FunctionFact, owners: Map<string, ClassFact>): boolean {
  return (
    isMemberOf(fn, owners) &&
    fn.parameters.every(({ annotations = [] }) => annotations.length === 0) &&
    isPlainForwarder(fn, SKIPPED_NAMES)
  );
}

function passesInOrder(fn: FunctionFact): boolean {
  const { forward } = fn;
  return (
    forward !== undefined &&
    !forward.typeArguments &&
    forward.name !== fn.name &&
    (forward.qualifier === undefined || forward.qualifier === 'this') &&
    forwardsArguments(fn)
  );
}

function resultType(fn: FunctionFact): string | undefined {
  if (fn.returnType !== undefined) {
    return compactType(fn.returnType);
  }
  return fn.expressionBody === true ? undefined : 'Unit';
}

function sameResult(fn: FunctionFact, target: FunctionFact): boolean {
  const own = resultType(fn);
  return own === undefined || own === resultType(target);
}

function isPlainTarget(target: FunctionFact): boolean {
  return (
    target.receiver === undefined &&
    !target.typeParameters &&
    !hasModifier(target, 'abstract') &&
    !hasModifier(target, 'inline') &&
    target.parameters.every(({ vararg, default: hasDefault }) => !(vararg || hasDefault))
  );
}

function sameSignature(fn: FunctionFact, target: FunctionFact): boolean {
  return (
    isPlainTarget(target) &&
    hasModifier(fn, 'suspend') === hasModifier(target, 'suspend') &&
    target.parameters.length === fn.parameters.length &&
    target.parameters.every(
      (parameter, index) => compactType(parameter.type) === compactType(fn.parameters[index]?.type),
    ) &&
    sameResult(fn, target)
  );
}

function siblingsNamed(file: KotlinFile, fn: FunctionFact, name: string): FunctionFact[] {
  return file.functions.filter(
    (other) => !other.local && other.owner === fn.owner && other.name === name,
  );
}

function isAlias(file: KotlinFile, fn: FunctionFact, owners: Map<string, ClassFact>): boolean {
  return isCandidate(fn, owners) && passesInOrder(fn) && aliasTarget(file, fn) !== undefined;
}

function aliasTarget(file: KotlinFile, fn: FunctionFact): FunctionFact | undefined {
  const [target, ...others] = siblingsNamed(file, fn, fn.forward?.name ?? '');
  return target !== undefined &&
    others.length === 0 &&
    siblingsNamed(file, fn, fn.name).length === 1 &&
    sameSignature(fn, target)
    ? target
    : undefined;
}

function isLaterOfMutual(
  { file, owners }: { file: KotlinFile; owners: Map<string, ClassFact> },
  fn: FunctionFact,
  target: FunctionFact,
): boolean {
  return (
    !(isAlias(file, target, owners) && target.forward?.name === fn.name) || target.line < fn.line
  );
}

function visibilityRank(fn: FunctionFact): number {
  if (fn.visibility === 'private') {
    return 2;
  }
  return fn.visibility === 'internal' || hasModifier(fn, 'protected') ? 1 : 0;
}

function isMoreVisible(fn: FunctionFact, target: FunctionFact): boolean {
  return visibilityRank(fn) < visibilityRank(target);
}

export function methodAliasFindings(
  files: KotlinFile[],
  { finding }: RuleOptions,
): ReviewFinding[] {
  return files
    .filter(({ test }) => !test)
    .flatMap((file) => {
      const owners = memberOwners(file);
      return file.functions
        .filter((fn) => isCandidate(fn, owners) && passesInOrder(fn))
        .flatMap((fn) => {
          const target = aliasTarget(file, fn);
          return target !== undefined && isLaterOfMutual({ file, owners }, fn, target)
            ? [{ fn, target }]
            : [];
        })
        .map(({ fn, target }) =>
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
