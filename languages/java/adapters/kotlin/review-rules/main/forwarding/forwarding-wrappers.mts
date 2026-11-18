import type { FunctionFact, KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { ReviewFinding, RuleOptions } from '../../typed/review-finding-types.mts';
import type { Declaration } from '../unused-options/unused-option-types.mts';
import { compactType, grouping } from '../../kotlin-facts.mts';
import { forwardsArguments, isPlainForwarder } from './forwarding-shape.mts';
import {
  declaredNames as untypedDeclaredNames,
  springManagedOwner as untypedManagedOwner,
} from '../../spring/spring-names.mts';
import {
  declarationOf,
  functionKind,
  reaches,
  typeAliasNames,
} from '../unused-options/call-reach.mts';

type Owners = { kinds: Map<string, string>; managed: (owner: string) => boolean };
type Target = { fn: FunctionFact; declaration: Declaration };
type TargetIndex = { targets: Map<string, Target[]>; typeAliases: Set<string> };

const declaredNames: (files: KotlinFile[]) => Set<string> = untypedDeclaredNames;
const springManagedOwner: (file: KotlinFile, declared: Set<string>) => (owner: string) => boolean =
  untypedManagedOwner;

export const FORWARDING_RULE = 'StaticForwardingWrapper';

const MESSAGE = `This function only passes its parameters, in order, to another function. Call that function directly where this one is used and delete the wrapper. Factories named of or from and copies such as List.copyOf are allowed.`;
const SKIPPED_NAMES = new Set(['main', 'valueOf', 'fromString', 'of', 'from', 'invoke', 'copy']);
const COPY_PREFIX = /^(?:copyOf|unmodifiable|synchronized|checked)/u;
const TYPE_NAME = String.raw`[A-Z][A-Z0-9_]*[a-z]\w*`;
const TYPE_QUALIFIER = new RegExp(`^(?:[a-z_]\\w*\\.)*${TYPE_NAME}(?:\\.${TYPE_NAME})*$`, 'u');
const STATIC_OWNERS = new Set(['object', 'companion']);

function ownerKinds(file: KotlinFile, declared: Set<string>): Owners {
  return {
    kinds: new Map(file.classes.map((klass): [string, string] => [klass.qualified, klass.kind])),
    managed: springManagedOwner(file, declared),
  };
}

function isStaticLike(fn: FunctionFact, owners: Owners): boolean {
  if (fn.owner === '') {
    return true;
  }
  return STATIC_OWNERS.has(owners.kinds.get(fn.owner) ?? '') && !owners.managed(fn.owner);
}

function candidate(fn: FunctionFact, owners: Owners): boolean {
  return isPlainForwarder(fn, SKIPPED_NAMES) && isStaticLike(fn, owners);
}

function passesInOrder(fn: FunctionFact): boolean {
  const { forward } = fn;
  return (
    forward !== undefined &&
    !forward.typeArguments &&
    !COPY_PREFIX.test(forward.name) &&
    forwardsArguments(fn) &&
    (forward.qualifier === undefined
      ? forward.name !== fn.name
      : TYPE_QUALIFIER.test(forward.qualifier))
  );
}

function targetsOf(files: KotlinFile[], declared: Set<string>): Map<string, Target[]> {
  const { groups: targets, append } = grouping<string, Target>();
  for (const file of files) {
    const owners = ownerKinds(file, declared);
    for (const fn of file.functions.filter(
      (entry) => !entry.local && isStaticLike(entry, owners),
    )) {
      const kind = functionKind(file, fn.owner);
      append(fn.name, { fn, declaration: declarationOf(file, { ...fn, kind, extension: false }) });
    }
  }
  return targets;
}

function sameSignature(fn: FunctionFact, target: FunctionFact): boolean {
  return (
    target !== fn &&
    target.receiver === undefined &&
    target.parameters.length === fn.parameters.length &&
    target.parameters.every(
      (parameter, index) => compactType(parameter.type) === compactType(fn.parameters[index]?.type),
    ) &&
    (fn.returnType === undefined ||
      target.returnType === undefined ||
      compactType(fn.returnType) === compactType(target.returnType))
  );
}

function forwardsTo(
  fn: FunctionFact,
  file: KotlinFile,
  { targets, typeAliases }: TargetIndex,
): boolean {
  const { forward } = fn;
  if (forward === undefined) {
    return false;
  }
  const { qualifier } = forward;
  const named = (targets.get(forward.name) ?? []).filter(({ declaration }) =>
    reaches({ file, qualifier, typeAliases }, declaration),
  );
  return (
    (qualifier !== undefined && named.length === 0) ||
    named.some((target) => sameSignature(fn, target.fn))
  );
}

export function forwardingWrapperFindings(
  files: KotlinFile[],
  { finding, declaredIn = files }: RuleOptions,
): ReviewFinding[] {
  const main = files.filter(({ test }) => !test);
  const declared = declaredNames(declaredIn);
  const targets: TargetIndex = {
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
