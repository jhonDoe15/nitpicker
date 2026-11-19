import type { TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices, type Context } from '../security/security-values.mts';
import { ts } from '../typed/typescript-views.mts';

export type TypeAnswer = 'yes' | 'no' | 'unknown';

function answer(holds: boolean): TypeAnswer {
  return holds ? 'yes' : 'no';
}

type CheckedType = { readonly checker: TypeScript.TypeChecker; readonly type: TypeScript.Type };

export function nonNullableTypeOf(context: Context, node: TSESTree.Node): CheckedType | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  return { checker, type: checker.getNonNullableType(services.getTypeAtLocation(node)) };
}

function memberTypes(
  context: Context,
  node: TSESTree.Node,
):
  | { readonly checker: TypeScript.TypeChecker; readonly members: readonly TypeScript.Type[] }
  | undefined {
  const typed = nonNullableTypeOf(context, node);
  if (typed === undefined) {
    return undefined;
  }
  const { checker, type } = typed;
  return { checker, members: type.isUnion() ? type.types : [type] };
}

export function hasArrayType(context: Context, node: TSESTree.Node, withTuples = true): TypeAnswer {
  const typed = memberTypes(context, node);
  if (typed === undefined) {
    return 'unknown';
  }
  const { checker, members } = typed;
  return answer(
    members.every(
      (member) => checker.isArrayType(member) || (withTuples && checker.isTupleType(member)),
    ),
  );
}

const COLLECTION_NAME = /^(?:Readonly|Weak)?(?:Map|Set)$|Array$/u;
const LIST_NAME = /^(?:Readonly)?(?:Map|Set)$|Array$/u;

function someMember(
  context: Context,
  node: TSESTree.Node,
  holds: (checker: TypeScript.TypeChecker, member: TypeScript.Type) => boolean,
): TypeAnswer {
  const typed = memberTypes(context, node);
  if (typed === undefined) {
    return 'unknown';
  }
  const { checker, members } = typed;
  return answer(members.some((member) => holds(checker, member)));
}

function isAny(member: TypeScript.Type): boolean {
  return (member.flags & ts.TypeFlags.Any) !== 0;
}

export function hasCollectionType(context: Context, node: TSESTree.Node): TypeAnswer {
  return someMember(
    context,
    node,
    (checker, member) =>
      isAny(member) ||
      checker.isArrayType(member) ||
      checker.isTupleType(member) ||
      COLLECTION_NAME.test(member.getSymbol()?.name ?? ''),
  );
}

export function hasListType(context: Context, node: TSESTree.Node): TypeAnswer {
  return someMember(context, node, (checker, type) => {
    const member = checker.getBaseConstraintOfType(type) ?? type;
    return (
      !checker.isTupleType(member) &&
      (isAny(member) ||
        checker.isArrayType(member) ||
        LIST_NAME.test(member.getSymbol()?.name ?? ''))
    );
  });
}
