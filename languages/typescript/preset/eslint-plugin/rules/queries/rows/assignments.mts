import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../../analysis/constant-resolution.mts';
import { memberName, unwrapped } from '../../security/security-values.mts';
import { expandsFully as untypedExpandsFully } from '../../../../../../../shared/traversal.mjs';

type Children = readonly TSESTree.Node[] | undefined;
type Loop = {
  readonly loop: TSESTree.Node;
  readonly element: string;
  readonly body: TSESTree.Node;
};

const expandsFully: <Item>(root: Item, children: (item: Item) => Children) => boolean =
  untypedExpandsFully;

function isDateNow(node: TSESTree.CallExpression): boolean {
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const object = unwrapped(callee.object);
  return (
    object.type === AST_NODE_TYPES.Identifier &&
    object.name === 'Date' &&
    memberName(callee) === 'now'
  );
}

function rootOf(node: TSESTree.Node): TSESTree.Node {
  const current = unwrapped(node);
  return current.type === AST_NODE_TYPES.MemberExpression ? rootOf(current.object) : current;
}

function dependentOn(element: string, name: string): Children {
  return name === element ? undefined : [];
}

function propertyValues(properties: TSESTree.ObjectLiteralElement[]): Children {
  const values: TSESTree.Node[] = [];
  for (const each of properties) {
    if (each.type !== AST_NODE_TYPES.Property || each.computed) {
      return undefined;
    }
    values.push(each.value);
  }
  return values;
}

function elementsOf(elements: TSESTree.ArrayExpression['elements']): Children {
  const present = elements.filter((each) => each !== null);
  return present.length === elements.length ? present : undefined;
}

function isDateConstruction(node: TSESTree.NewExpression): boolean {
  return node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'Date';
}

function leafChildren(target: TSESTree.Node, element: string): Children {
  if (target.type === AST_NODE_TYPES.Literal || target.type === AST_NODE_TYPES.ThisExpression) {
    return [];
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    return dependentOn(element, target.name);
  }
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    return [rootOf(target), target.property];
  }
  if (target.type === AST_NODE_TYPES.NewExpression) {
    return isDateConstruction(target) ? target.arguments : undefined;
  }
  if (target.type === AST_NODE_TYPES.CallExpression) {
    return isDateNow(target) ? [] : undefined;
  }
  return undefined;
}

function childrenOf(target: TSESTree.Node, element: string): Children {
  if (target.type === AST_NODE_TYPES.TemplateLiteral) {
    return target.expressions;
  }
  if (target.type === AST_NODE_TYPES.ArrayExpression) {
    return elementsOf(target.elements);
  }
  if (target.type === AST_NODE_TYPES.ObjectExpression) {
    return propertyValues(target.properties);
  }
  if (target.type === AST_NODE_TYPES.UnaryExpression) {
    return [target.argument];
  }
  if (
    target.type === AST_NODE_TYPES.BinaryExpression ||
    target.type === AST_NODE_TYPES.LogicalExpression
  ) {
    return [target.left, target.right];
  }
  if (target.type === AST_NODE_TYPES.ConditionalExpression) {
    return [target.test, target.consequent, target.alternate];
  }
  return leafChildren(target, element);
}

function independent(node: TSESTree.Node, element: string): boolean {
  return expandsFully(node, (item) => childrenOf(unwrapped(item), element));
}

function isFieldAssignment(statement: TSESTree.Node, element: string): boolean {
  const expression =
    statement.type === AST_NODE_TYPES.ExpressionStatement ? statement.expression : statement;
  return (
    expression.type === AST_NODE_TYPES.AssignmentExpression &&
    expression.operator === '=' &&
    expression.left.type === AST_NODE_TYPES.MemberExpression &&
    expression.left.object.type === AST_NODE_TYPES.Identifier &&
    expression.left.object.name === element &&
    independent(expression.right, element)
  );
}

export function assignsOnly(body: TSESTree.Node, element: string): boolean {
  const statements = body.type === AST_NODE_TYPES.BlockStatement ? body.body : [body];
  return statements.length > 0 && statements.every((each) => isFieldAssignment(each, element));
}

function forOfLoop(parent: TSESTree.ForOfStatement): Loop | undefined {
  const [declarator] =
    parent.left.type === AST_NODE_TYPES.VariableDeclaration ? parent.left.declarations : [];
  const element =
    declarator?.id.type === AST_NODE_TYPES.Identifier ? declarator.id.name : undefined;
  return element === undefined ? undefined : { loop: parent, element, body: parent.body };
}

export function loopOf(read: TSESTree.Node): Loop | undefined {
  const { parent } = read;
  if (parent?.type === AST_NODE_TYPES.ForOfStatement && parent.right === read) {
    return forOfLoop(parent);
  }
  const call = parent?.parent;
  if (
    parent?.type !== AST_NODE_TYPES.MemberExpression ||
    parent.object !== read ||
    memberName(parent) !== 'forEach' ||
    call?.type !== AST_NODE_TYPES.CallExpression ||
    call.callee !== parent
  ) {
    return undefined;
  }
  const [callback] = call.arguments;
  const [param] = isFunctionNode(callback) ? callback.params : [];
  return param?.type === AST_NODE_TYPES.Identifier && isFunctionNode(callback)
    ? { loop: call, element: param.name, body: callback.body }
    : undefined;
}
