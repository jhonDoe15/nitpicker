import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { memberName, typeServices, type Context } from '../../security/security-values.mts';
import { ts } from '../../typed/typescript-views.mts';
import { skipped } from '../io-origin.mts';
import { isUnlimited } from './rxjs-calls.mts';

const UNKNOWN = 'unknown';

type TypedLimit = 'limit' | 'other' | typeof UNKNOWN;

const SCHEDULER_NAME = /[sS]cheduler$/u;
const LOOSE_FLAGS = ts.TypeFlags.Any | ts.TypeFlags.Unknown;

function isSchedulerType(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  return (
    type.getSymbol()?.getName() === 'SchedulerLike' ||
    checker.getPropertyOfType(checker.getApparentType(type), 'schedule') !== undefined
  );
}

function typedLimit(context: Context, node: TSESTree.Node): TypedLimit {
  const services = typeServices(context);
  if (services === undefined) {
    return UNKNOWN;
  }
  const type = services.getTypeAtLocation(node);
  if ((type.flags & LOOSE_FLAGS) !== 0) {
    return UNKNOWN;
  }
  const checker = services.program.getTypeChecker();
  const members = type.isUnion() ? type.types : [type];
  const numeric =
    !members.some((member) => isSchedulerType(checker, member)) &&
    members.some((member) => (member.flags & ts.TypeFlags.NumberLike) !== 0);
  return numeric ? 'limit' : 'other';
}

function nameOf(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  return node.type === AST_NODE_TYPES.MemberExpression ? memberName(node) : undefined;
}

function namedLimit(node: TSESTree.Node): boolean {
  const name = nameOf(node);
  return name === undefined || !SCHEDULER_NAME.test(name);
}

function isLimitTarget(context: Context, target: TSESTree.Node): boolean {
  if (target.type === AST_NODE_TYPES.Literal) {
    return typeof target.value === 'number';
  }
  const typed = typedLimit(context, target);
  return typed === UNKNOWN ? namedLimit(target) : typed === 'limit';
}

export function isLimitArgument(context: Context, node: TSESTree.Node): boolean {
  return !isUnlimited(context, node) && isLimitTarget(context, skipped(node));
}
