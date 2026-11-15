import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { nameOf, type Ranged, type SourceCode } from '../typed/node-views.mts';
import { isCallerObject } from '../analysis/mutation/caller-objects.mts';
import { mutatedOwner, staticName } from '../analysis/mutation/mutating-methods.mts';
import { typedScopeOf, type TypedScope } from '../promises/cannot-reject.mts';
import { isObjectAssign } from './parameter-copies.mts';
import { changedParameter, withoutAssertion } from './parameter-owners.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type MessageIds = 'parameterMutation' | 'propertyWrite';
type Services = ParserServicesWithTypeInformation;
type Scope = TypedScope<MessageIds>;

function isMutableIndexed(services: Services, node: TSESTree.Node): boolean {
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(node);
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((part) =>
    checker.getIndexInfosOfType(checker.getApparentType(part)).some((info) => !info.isReadonly),
  );
}

function textOf(sourceCode: SourceCode, node: TSESTree.Node): string {
  return sourceCode.getText(node).replaceAll(/\s+/g, ' ');
}

function isElementWrite(services: Services, target: TSESTree.MemberExpression): boolean {
  return (
    isMutableIndexed(services, target.object) &&
    (target.computed || nameOf(target.property) === 'length')
  );
}

function callerParameter(scope: Scope, object: TSESTree.Node, mutation: Ranged): unknown {
  const { services, sourceCode } = scope;
  function crossesProperty(member: TSESTree.MemberExpression): boolean {
    return isCallerObject(services, member.object, nameOf(member.property));
  }
  return changedParameter({ sourceCode, crossesProperty }, object, mutation);
}

function checkWrite(scope: Scope, node: TSESTree.Node, written: TSESTree.Node): void {
  const { context, services, sourceCode } = scope;
  const target = withoutAssertion(written);
  if (
    target.type !== AST_NODE_TYPES.MemberExpression ||
    callerParameter(scope, target.object, node) === undefined
  ) {
    return;
  }
  if (isElementWrite(services, target)) {
    const name = `${textOf(sourceCode, target.object)}[…]`;
    context.report({ node, messageId: 'parameterMutation', data: { name } });
    return;
  }
  const property = staticName(target, services);
  if (property !== undefined && isCallerObject(services, target.object, property)) {
    const name = textOf(sourceCode, target);
    context.report({ node, messageId: 'propertyWrite', data: { name } });
  }
}

function checkAssign(scope: Scope, node: TSESTree.CallExpression): void {
  const { context, services, sourceCode } = scope;
  const [written, ...sources] = node.arguments;
  const first = written === undefined ? undefined : withoutAssertion(written);
  if (
    first !== undefined &&
    sources.length > 0 &&
    first.type !== AST_NODE_TYPES.SpreadElement &&
    callerParameter(scope, first, node) !== undefined &&
    isCallerObject(services, first, undefined)
  ) {
    const name = `Object.assign(${textOf(sourceCode, first)}, …)`;
    context.report({ node, messageId: 'propertyWrite', data: { name } });
  }
}

function checkCall(scope: Scope, node: TSESTree.CallExpression): void {
  const { callee } = node;
  const { context, services, sourceCode } = scope;
  if (isObjectAssign(node)) {
    checkAssign(scope, node);
    return;
  }
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callerParameter(scope, callee.object, node) === undefined
  ) {
    return;
  }
  const method = staticName(callee, services);
  if (method !== undefined && mutatedOwner(callee, method, services) !== undefined) {
    const name = `${textOf(sourceCode, callee.object)}.${method}`;
    context.report({ node, messageId: 'parameterMutation', data: { name } });
  }
}

export const rule: TSESLint.RuleModule<MessageIds, [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow changing an array, Set, Map, indexed object or project object that a parameter holds in place',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      parameterMutation:
        '`{{ name }}` changes the value the caller passed in. Build and return a new value instead (`[...items, item]`, `new Set([...set, item])`, `{ ...table, [key]: value }`, `items.toSorted()`), or copy the parameter first (`const copy = [...items]`).',
      propertyWrite:
        '`{{ name }}` writes to the object the caller passed in, so a frozen or shared object breaks. Build a new object instead (`{ ...options, timeout: 5000 }`), or copy the parameter first (`const next = { ...options }`). An exception fits only when this function fills an object its caller hands it to be filled.',
    },
  },
  create(context) {
    const scope = typedScopeOf(context);
    if (scope === undefined) {
      return {};
    }
    return {
      CallExpression(node: TSESTree.CallExpression) {
        checkCall(scope, node);
      },
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        checkWrite(scope, node, node.left);
      },
      UpdateExpression(node: TSESTree.UpdateExpression) {
        checkWrite(scope, node, node.argument);
      },
      UnaryExpression(node: TSESTree.UnaryExpression) {
        if (node.operator === 'delete') {
          checkWrite(scope, node, node.argument);
        }
      },
    };
  },
};
