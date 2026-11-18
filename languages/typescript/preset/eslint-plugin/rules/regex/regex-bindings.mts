import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { unwrapped } from '../security/security-values.mts';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';

type Node = TSESTree.Node;
type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;
export type HeldRegex = { readonly creation: Node; readonly flag: string };

const { DefinitionType } = TSESLint.Scope;
const TYPE_WRAPPERS = new Set<string>([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
]);
const LOOPS = new Set<string>([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);
const CONDITION_LOOPS = new Set<string>(['WhileStatement', 'DoWhileStatement', 'ForStatement']);
const LOOP_TEST_WRAPPERS = new Set<string>([
  'AssignmentExpression',
  'BinaryExpression',
  'UnaryExpression',
  'LogicalExpression',
]);

function isRegExpCall(
  node: Node | undefined,
): node is TSESTree.NewExpression | TSESTree.CallExpression {
  return (
    (node?.type === AST_NODE_TYPES.NewExpression || node?.type === AST_NODE_TYPES.CallExpression) &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'RegExp'
  );
}

function literalFlags(node: Node): string | undefined {
  return node.type === AST_NODE_TYPES.Literal && 'regex' in node ? node.regex.flags : undefined;
}

function creationFlags(context: SourceContext, node: Node): string | undefined {
  const target = unwrapped(node);
  const literal = literalFlags(target);
  if (literal !== undefined) {
    return literal;
  }
  if (!isRegExpCall(target) || target.arguments.length === 0) {
    return undefined;
  }
  const [pattern, flags] = target.arguments;
  if (flags !== undefined) {
    return stringValue(resolveConstant(context, flags));
  }
  return (pattern === undefined ? undefined : literalFlags(pattern)) ?? '';
}

function statefulFlag(flags: string | undefined): string | undefined {
  return ['g', 'y'].find((flag) => flags?.includes(flag));
}

export function enclosingScope(node: Node): Node | undefined {
  return ancestorsOf(node).find(
    (ancestor) =>
      isFunctionNode(ancestor) ||
      ancestor.type === AST_NODE_TYPES.PropertyDefinition ||
      ancestor.type === AST_NODE_TYPES.StaticBlock ||
      ancestor.type === AST_NODE_TYPES.Program,
  );
}

function propertyName(member: TSESTree.MemberExpression): string | undefined {
  if (member.computed) {
    return stringValue(member.property);
  }
  return nameOf(member.property);
}

function keyName(key: Node): string | undefined {
  return key.type === AST_NODE_TYPES.Identifier || key.type === AST_NODE_TYPES.PrivateIdentifier
    ? key.name
    : undefined;
}

function enclosingClass(node: Node): ClassNode | undefined {
  return ancestorsOf(node).find((ancestor) => ancestor.type === AST_NODE_TYPES.ClassBody)?.parent;
}

function constructorAssignment(classNode: ClassNode, name: string): Node | undefined {
  const constructor = classNode.body.body.find(
    (member) => member.type === AST_NODE_TYPES.MethodDefinition && member.kind === 'constructor',
  );
  const statements =
    constructor?.type === AST_NODE_TYPES.MethodDefinition
      ? (constructor.value.body?.body ?? [])
      : [];
  return statements
    .flatMap((statement) =>
      statement.type === AST_NODE_TYPES.ExpressionStatement ? [statement.expression] : [],
    )
    .flatMap((expression) =>
      expression.type === AST_NODE_TYPES.AssignmentExpression &&
      expression.left.type === AST_NODE_TYPES.MemberExpression &&
      expression.left.object.type === AST_NODE_TYPES.ThisExpression &&
      propertyName(expression.left) === name
        ? [expression.right]
        : [],
    )
    .at(0);
}

function classMemberValue(classNode: ClassNode, name: string, isStatic: boolean): Node | undefined {
  const member = classNode.body.body.find(
    (candidate): candidate is TSESTree.PropertyDefinition =>
      candidate.type === AST_NODE_TYPES.PropertyDefinition &&
      !candidate.computed &&
      candidate.static === isStatic &&
      keyName(candidate.key) === name,
  );
  const value = member?.value;
  if (value !== undefined && value !== null) {
    return value;
  }
  return isStatic ? undefined : constructorAssignment(classNode, name);
}

function onlyDefinition(
  context: SourceContext,
  identifier: TSESTree.Identifier,
):
  | { readonly variable: TSESLint.Scope.Variable; readonly definition: TSESLint.Scope.Definition }
  | undefined {
  const variable = findVariable(context, identifier, identifier.name);
  const [definition] = variable?.defs ?? [];
  return variable?.defs.length === 1 && definition !== undefined
    ? { variable, definition }
    : undefined;
}

function isNeverReassigned(variable: TSESLint.Scope.Variable): boolean {
  return variable.references.filter((reference) => reference.isWrite()).length <= 1;
}

function variableValue(context: SourceContext, identifier: TSESTree.Identifier): Node | undefined {
  const found = onlyDefinition(context, identifier);
  const definition = found?.definition;
  if (
    found === undefined ||
    definition?.type !== DefinitionType.Variable ||
    definition.node.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  return isNeverReassigned(found.variable) ? (definition.node.init ?? undefined) : undefined;
}

function objectPropertyValue(
  objectExpression: TSESTree.ObjectExpression,
  name: string,
): Node | undefined {
  const property = objectExpression.properties.find(
    (candidate): candidate is TSESTree.Property =>
      candidate.type === AST_NODE_TYPES.Property &&
      !candidate.computed &&
      candidate.kind === 'init' &&
      (keyName(candidate.key) ?? stringValue(candidate.key)) === name,
  );
  return property?.value;
}

function thisMemberValue(member: TSESTree.MemberExpression, name: string): Node | undefined {
  const classNode = enclosingClass(member);
  const holder = enclosingScope(member)?.parent;
  const isStatic = holder !== undefined && 'static' in holder && holder.static;
  return classNode === undefined ? undefined : classMemberValue(classNode, name, isStatic);
}

function memberValue(context: SourceContext, member: TSESTree.MemberExpression): Node | undefined {
  const name = propertyName(member);
  const object = unwrapped(member.object);
  if (name === undefined) {
    return undefined;
  }
  if (object.type === AST_NODE_TYPES.ThisExpression) {
    return thisMemberValue(member, name);
  }
  if (object.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = onlyDefinition(context, object)?.definition;
  if (definition?.type === DefinitionType.ClassName) {
    return classMemberValue(definition.node, name, true);
  }
  const value = unwrapped(variableValue(context, object));
  return value?.type === AST_NODE_TYPES.ObjectExpression
    ? objectPropertyValue(value, name)
    : undefined;
}

function heldValue(context: SourceContext, target: Node): Node | undefined {
  if (target.type === AST_NODE_TYPES.Identifier) {
    return variableValue(context, target);
  }
  return target.type === AST_NODE_TYPES.MemberExpression ? memberValue(context, target) : undefined;
}

export function heldRegex(context: SourceContext, node: Node): HeldRegex | undefined {
  const value = heldValue(context, unwrapped(node));
  const flag = value === undefined ? undefined : statefulFlag(creationFlags(context, value));
  return value === undefined || flag === undefined
    ? undefined
    : { creation: unwrapped(value), flag };
}

export function isLoopCondition(call: Node): boolean {
  let child = call;
  for (const parent of ancestorsOf(call)) {
    if (CONDITION_LOOPS.has(parent.type)) {
      return 'test' in parent && parent.test === child;
    }
    if (!(LOOP_TEST_WRAPPERS.has(parent.type) || TYPE_WRAPPERS.has(parent.type))) {
      return false;
    }
    child = parent;
  }
  return false;
}

export function isInLoopWithout(node: Node, scope: Node | undefined, inner: Node): boolean {
  for (const ancestor of ancestorsOf(node)) {
    if (ancestor === scope) {
      return false;
    }
    const contains = ancestor.range[0] <= inner.range[0] && inner.range[1] <= ancestor.range[1];
    if (LOOPS.has(ancestor.type) && !contains) {
      return true;
    }
  }
  return false;
}

function branchesOf(owner: Node): readonly Node[] {
  if (
    owner.type === AST_NODE_TYPES.IfStatement ||
    owner.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return owner.alternate === null ? [owner.consequent] : [owner.consequent, owner.alternate];
  }
  return owner.type === AST_NODE_TYPES.SwitchStatement ? owner.cases : [];
}

function branchOf(owner: Node, node: Node): Node | undefined {
  return branchesOf(owner).find(
    (branch) => branch.range[0] <= node.range[0] && node.range[1] <= branch.range[1],
  );
}

export function areExclusive(left: Node, right: Node): boolean {
  const shared = ancestorsOf(left).find(
    (ancestor) => ancestor.range[0] <= right.range[0] && right.range[1] <= ancestor.range[1],
  );
  if (shared === undefined) {
    return false;
  }
  const leftBranch = branchOf(shared, left);
  const rightBranch = branchOf(shared, right);
  return leftBranch !== undefined && rightBranch !== undefined && leftBranch !== rightBranch;
}
