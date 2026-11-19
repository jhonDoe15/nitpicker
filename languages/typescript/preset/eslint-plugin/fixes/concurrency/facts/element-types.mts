import type { TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { arrayItemTypes } from '../../../rules/support/array-items.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';

const UNKNOWN_FLAGS =
  ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter | ts.TypeFlags.Never;

function leavesOf(checker: TypeScript.TypeChecker, item: TypeScript.Type): TypeScript.Type[] {
  const pending = [item];
  const leaves: TypeScript.Type[] = [];
  for (const type of pending) {
    const base =
      type.flags & UNKNOWN_FLAGS ? (checker.getBaseConstraintOfType(type) ?? type) : type;
    if (base.isUnion()) {
      appendAll(pending, base.types);
    } else {
      leaves.push(base);
    }
  }
  return leaves;
}

function isPlainValue(checker: TypeScript.TypeChecker, item: TypeScript.Type): boolean {
  return leavesOf(checker, item).every(
    (member) =>
      (member.flags & UNKNOWN_FLAGS) === 0 &&
      checker.getPropertyOfType(checker.getApparentType(member), 'then') === undefined,
  );
}

export function hasPlainItems(context: Context, collection: TSESTree.Node): boolean {
  const typed = arrayItemTypes(context, collection);
  return typed !== undefined && typed.items.every((item) => isPlainValue(typed.checker, item));
}
