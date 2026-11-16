import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../analysis/constant-resolution.mts';
import { staticKeyName } from '../analysis/static-shapes.mts';
import { nodeChildren, type SourceCode } from '../typed/node-views.mts';
import { SEQUELIZE, importedName, importsOrm, objectOf, propertiesOf } from './orm-bindings.mts';

const DEFAULT_SCOPE = 'defaultScope';
const SCOPE_DECORATOR = 'DefaultScope';
const ADD_SCOPE = 'addScope';

function childNodes(node: TSESTree.Node): TSESTree.Node[] {
  return nodeChildren(node).filter((child) => !isFunctionNode(child));
}

function returnedValues(body: TSESTree.Node): (TSESTree.Node | undefined)[] {
  const pending = [body];
  const returned: (TSESTree.Node | undefined)[] = [];
  for (const node of pending) {
    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      returned.push(node.argument ?? undefined);
    } else {
      pending.push(...childNodes(node));
    }
  }
  return returned;
}

function returnedObjects(
  sourceCode: SourceCode,
  scope: TSESTree.Node | undefined,
): (TSESTree.ObjectExpression | undefined)[] {
  if (!isFunctionNode(scope)) {
    return [objectOf(sourceCode, scope)];
  }
  if (scope.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [objectOf(sourceCode, scope.body)];
  }
  return returnedValues(scope.body).map((value) => objectOf(sourceCode, value));
}

function includesAssociations(include: TSESTree.Property): boolean {
  const { value } = include;
  if (value.type === AST_NODE_TYPES.Identifier) {
    return value.name !== 'undefined';
  }
  return value.type !== AST_NODE_TYPES.ArrayExpression || value.elements.length > 0;
}

export function eagerInclude(
  sourceCode: SourceCode,
  scope: TSESTree.Node | undefined,
): TSESTree.Property | undefined {
  return returnedObjects(sourceCode, scope)
    .map((object) => propertiesOf(sourceCode, object).get('include'))
    .find((include) => include !== undefined && includesAssociations(include));
}

function isDefaultScopeCall(call: TSESTree.CallExpression): boolean {
  const [name] = call.arguments;
  return (
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    staticKeyName(call.callee) === ADD_SCOPE &&
    name?.type === AST_NODE_TYPES.Literal &&
    name.value === DEFAULT_SCOPE
  );
}

export function defaultScopeOf(
  sourceCode: SourceCode,
  node: TSESTree.CallExpression | TSESTree.Property,
): TSESTree.Node | undefined {
  if (!importsOrm(sourceCode, SEQUELIZE)) {
    return undefined;
  }
  if (node.type === AST_NODE_TYPES.Property) {
    return staticKeyName(node) === DEFAULT_SCOPE ? node.value : undefined;
  }
  if (isDefaultScopeCall(node)) {
    return node.arguments[1];
  }
  return importedName(sourceCode, node.callee, SEQUELIZE) === SCOPE_DECORATOR
    ? node.arguments[0]
    : undefined;
}
