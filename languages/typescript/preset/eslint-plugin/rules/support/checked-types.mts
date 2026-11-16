import type { TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices, type Context } from '../security/security-values.mts';
import { ts } from '../typed/typescript-views.mts';

export type TypeAnswer = 'yes' | 'no' | 'unknown';

function answer(holds: boolean): TypeAnswer {
  return holds ? 'yes' : 'no';
}

function memberTypes(
  context: Context,
  node: TSESTree.Node,
):
  | { readonly checker: TypeScript.TypeChecker; readonly members: readonly TypeScript.Type[] }
  | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(node));
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

export function hasCollectionType(context: Context, node: TSESTree.Node): TypeAnswer {
  const typed = memberTypes(context, node);
  if (typed === undefined) {
    return 'unknown';
  }
  const { checker, members } = typed;
  return answer(
    members.some(
      (member) =>
        (member.flags & ts.TypeFlags.Any) !== 0 ||
        checker.isArrayType(member) ||
        checker.isTupleType(member) ||
        COLLECTION_NAME.test(member.getSymbol()?.name ?? ''),
    ),
  );
}
