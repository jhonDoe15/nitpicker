import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import { nameOf, type SourceCode } from '../../typed/node-views.mts';
import { isCallerObject } from '../../analysis/mutation/caller-objects.mts';
import { mutatedOwner, staticName } from '../../analysis/mutation/mutating-methods.mts';
import { isObjectAssign, isObjectDefine } from '../parameter-copies.mts';
import { withoutAssertion } from '../parameter-owners.mts';

export type Mutation = {
  readonly object: TSESTree.Node;
  readonly messageId: 'parameterMutation' | 'propertyWrite';
  readonly name: string;
};

export type MutationScope = {
  readonly services: ParserServicesWithTypeInformation;
  readonly sourceCode: SourceCode;
};

function textOf(sourceCode: SourceCode, node: TSESTree.Node): string {
  return sourceCode.getText(node).replaceAll(/\s+/g, ' ');
}

function isMutableIndexed(
  services: ParserServicesWithTypeInformation,
  node: TSESTree.Node,
): boolean {
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(node);
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((part) =>
    checker.getIndexInfosOfType(checker.getApparentType(part)).some((info) => !info.isReadonly),
  );
}

function writeMutation(scope: MutationScope, written: TSESTree.Node): Mutation | undefined {
  const { services, sourceCode } = scope;
  const target = withoutAssertion(written);
  if (target.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  if (
    isMutableIndexed(services, target.object) &&
    (target.computed || nameOf(target.property) === 'length')
  ) {
    const name = `${textOf(sourceCode, target.object)}[…]`;
    return { object: target.object, messageId: 'parameterMutation', name };
  }
  const property = staticName(target, services);
  return property !== undefined && isCallerObject(services, target.object, property)
    ? { object: target.object, messageId: 'propertyWrite', name: textOf(sourceCode, target) }
    : undefined;
}

function assignMutation(scope: MutationScope, node: TSESTree.CallExpression): Mutation | undefined {
  const { services, sourceCode } = scope;
  const [written, ...sources] = node.arguments;
  const first = written === undefined ? undefined : withoutAssertion(written);
  if (
    first === undefined ||
    sources.length === 0 ||
    first.type === AST_NODE_TYPES.SpreadElement ||
    !isCallerObject(services, first, undefined)
  ) {
    return undefined;
  }
  const callee = textOf(sourceCode, node.callee);
  return {
    object: first,
    messageId: 'propertyWrite',
    name: `${callee}(${textOf(sourceCode, first)}, …)`,
  };
}

function callMutation(scope: MutationScope, node: TSESTree.CallExpression): Mutation | undefined {
  if (isObjectAssign(node) || isObjectDefine(node)) {
    return assignMutation(scope, node);
  }
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const method = staticName(callee, scope.services);
  return method !== undefined && mutatedOwner(callee, method, scope.services) !== undefined
    ? {
        object: callee.object,
        messageId: 'parameterMutation',
        name: `${textOf(scope.sourceCode, callee.object)}.${method}`,
      }
    : undefined;
}

export function mutationAt(scope: MutationScope, node: TSESTree.Node): Mutation | undefined {
  switch (node.type) {
    case AST_NODE_TYPES.CallExpression:
      return callMutation(scope, node);
    case AST_NODE_TYPES.AssignmentExpression:
      return writeMutation(scope, node.left);
    case AST_NODE_TYPES.UpdateExpression:
      return writeMutation(scope, node.argument);
    case AST_NODE_TYPES.UnaryExpression:
      return node.operator === 'delete' ? writeMutation(scope, node.argument) : undefined;
    default:
      return undefined;
  }
}

export function parameterWalk(scope: MutationScope): {
  readonly sourceCode: SourceCode;
  readonly crossesProperty: (member: TSESTree.MemberExpression) => boolean;
} {
  const { services, sourceCode } = scope;
  return {
    sourceCode,
    crossesProperty: (member) => isCallerObject(services, member.object, nameOf(member.property)),
  };
}
