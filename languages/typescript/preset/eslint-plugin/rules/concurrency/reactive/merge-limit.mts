import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { memberName, typeServices, type Context } from '../../security/security-values.mts';
import { ts } from '../../typed/typescript-views.mts';
import { skipped } from '../io-origin.mts';
import { isUnlimited } from './rxjs-calls.mts';

const SCHEDULER_NAME = /[sS]cheduler$/u;
const LOOSE_FLAGS = ts.TypeFlags.Any | ts.TypeFlags.Unknown;

function isSchedulerType(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  return (
    type.getSymbol()?.getName() === 'SchedulerLike' ||
    checker.getPropertyOfType(checker.getApparentType(type), 'schedule') !== undefined
  );
}

function typedLimit(context: Context, node: TSESTree.Node): boolean | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const type = services.getTypeAtLocation(node);
  if ((type.flags & LOOSE_FLAGS) !== 0) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const members = type.isUnion() ? type.types : [type];
  return (
    !members.some((member) => isSchedulerType(checker, member)) &&
    members.some((member) => (member.flags & ts.TypeFlags.NumberLike) !== 0)
  );
}

function namedLimit(node: TSESTree.Node): boolean {
  const name =
    node.type === AST_NODE_TYPES.Identifier
      ? node.name
      : node.type === AST_NODE_TYPES.MemberExpression
        ? memberName(node)
        : undefined;
  return name === undefined || !SCHEDULER_NAME.test(name);
}

export function isLimitArgument(context: Context, node: TSESTree.Node): boolean {
  const target = skipped(node);
  return (
    !isUnlimited(context, node) &&
    (target.type === AST_NODE_TYPES.Literal
      ? typeof target.value === 'number'
      : (typedLimit(context, target) ?? namedLimit(target)))
  );
}
