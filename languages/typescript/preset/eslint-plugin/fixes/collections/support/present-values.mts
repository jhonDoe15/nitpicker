import type { TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';

const ABSENT_FLAGS =
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.Never |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Void;

function leavesOf(checker: TypeScript.TypeChecker, type: TypeScript.Type): TypeScript.Type[] {
  const pending = [type];
  const leaves: TypeScript.Type[] = [];
  for (const current of pending) {
    const constraint = current.isUnion() ? undefined : checker.getBaseConstraintOfType(current);
    if (current.isUnion()) {
      appendAll(pending, current.types);
    } else if (constraint !== undefined && constraint !== current) {
      pending.push(constraint);
    } else {
      leaves.push(current);
    }
  }
  return leaves;
}

export function isPresentValue(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const options = services.program.getCompilerOptions();
  if (
    options.strictNullChecks !== true &&
    !(options.strictNullChecks === undefined && options.strict === true)
  ) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const leaves = leavesOf(checker, services.getTypeAtLocation(node));
  return leaves.length > 0 && leaves.every((leaf) => (leaf.flags & ABSENT_FLAGS) === 0);
}
