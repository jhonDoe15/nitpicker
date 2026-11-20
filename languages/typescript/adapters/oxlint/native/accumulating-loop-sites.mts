import type TypeScript from 'typescript';
import { chainOf, childrenOf, parentOf, typescriptApi } from '../../typed/typescript-program.mts';

type Node = TypeScript.Node;
type DeclaringList = TypeScript.VariableDeclarationList | typeof OTHER;

const ts = typescriptApi();
const OTHER = 'other';

const LOOP_KINDS = new Set([
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
]);
const SHAPE_KINDS = new Set([
  ts.SyntaxKind.ArrayLiteralExpression,
  ts.SyntaxKind.ObjectLiteralExpression,
]);
const STEP_OPERATORS = new Set([ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken]);

function contains(outer: Node, inner: Node): boolean {
  return outer.pos <= inner.pos && inner.end <= outer.end;
}

function wrapped(node: Node): Node | undefined {
  return ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isExpressionWithTypeArguments(node)
    ? node.expression
    : undefined;
}

function unwrapped(node: Node): Node {
  return chainOf(node, wrapped).at(-1) ?? node;
}

function nestedBindings(binding: TypeScript.BindingName): TypeScript.BindingName[] {
  if (ts.isIdentifier(binding)) {
    return [];
  }
  return binding.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : [element.name],
  );
}

function bindingNames(name: TypeScript.BindingName): string[] {
  const names: string[] = [];
  const pending: TypeScript.BindingName[] = [name];
  for (const binding of pending) {
    if (ts.isIdentifier(binding)) {
      names.push(binding.text);
    }
    for (const nested of nestedBindings(binding)) {
      pending.push(nested);
    }
  }
  return names;
}

function declares(list: TypeScript.VariableDeclarationList, name: string): boolean {
  return list.declarations.some((declaration) => bindingNames(declaration.name).includes(name));
}

function statementsOf(node: Node): readonly TypeScript.Statement[] {
  return ts.isBlock(node) ||
    ts.isSourceFile(node) ||
    ts.isModuleBlock(node) ||
    ts.isCaseClause(node) ||
    ts.isDefaultClause(node)
    ? node.statements
    : [];
}

function statementDeclaration(
  statement: TypeScript.Statement,
  name: string,
): DeclaringList | undefined {
  if (ts.isVariableStatement(statement)) {
    return declares(statement.declarationList, name) ? statement.declarationList : undefined;
  }
  const named = ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement);
  return named && statement.name?.text === name ? OTHER : undefined;
}

function loopInitializer(node: Node): TypeScript.ForInitializer | undefined {
  return ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)
    ? node.initializer
    : undefined;
}

function declaringList(node: Node, name: string): DeclaringList | undefined {
  const parameters = ts.isFunctionLike(node) ? node.parameters : [];
  const caught = ts.isCatchClause(node) ? node.variableDeclaration : undefined;
  const initializer = loopInitializer(node);
  if (
    parameters.some((parameter) => bindingNames(parameter.name).includes(name)) ||
    (caught !== undefined && bindingNames(caught.name).includes(name))
  ) {
    return OTHER;
  }
  if (initializer !== undefined && ts.isVariableDeclarationList(initializer)) {
    return declares(initializer, name) ? initializer : undefined;
  }
  return statementsOf(node)
    .map((statement) => statementDeclaration(statement, name))
    .find((found) => found !== undefined);
}

function scan(root: Node, name: string): Node[] {
  const nodes = [root];
  for (const node of nodes) {
    const kept = childrenOf(node).filter((child) => declaringList(child, name) === undefined);
    for (const child of kept) {
      nodes.push(child);
    }
  }
  return nodes;
}

function isNamed(node: Node, name: string): node is TypeScript.Identifier {
  return ts.isIdentifier(node) && node.text === name;
}

function isTarget(node: Node, name: string): boolean {
  if (!isNamed(node, name)) {
    return false;
  }
  const { parent } = node;
  const isMemberObject =
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
    parent.expression === node;
  const isKey = ts.isPropertyAssignment(parent) && parent.name === node;
  return !(isMemberObject || isKey);
}

function writesName(target: Node, nodes: readonly Node[], name: string): boolean {
  const root = unwrapped(target);
  if (isNamed(root, name)) {
    return true;
  }
  const isPattern = ts.isArrayLiteralExpression(root) || ts.isObjectLiteralExpression(root);
  return isPattern && nodes.some((node) => isTarget(node, name) && contains(root, node));
}

function isAssignment(node: Node): node is TypeScript.BinaryExpression {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  );
}

function otherWrite(node: Node, nodes: readonly Node[], name: string): boolean {
  if (isAssignment(node)) {
    const plain =
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken && isNamed(unwrapped(node.left), name);
    return !plain && writesName(node.left, nodes, name);
  }
  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
    return STEP_OPERATORS.has(node.operator) && writesName(node.operand, nodes, name);
  }
  const initializer = loopInitializer(node);
  return (
    initializer !== undefined &&
    !ts.isForStatement(node) &&
    !ts.isVariableDeclarationList(initializer) &&
    writesName(initializer, nodes, name)
  );
}

function spreadSite(
  assignment: TypeScript.BinaryExpression,
  context: { readonly nodes: readonly Node[]; readonly name: string; readonly list: Node },
): Node | undefined {
  const value = unwrapped(assignment.right);
  const inLoop = chainOf<Node>(assignment, parentOf).some(
    (node) => LOOP_KINDS.has(node.kind) && !contains(node, context.list),
  );
  const spreads = context.nodes.filter(
    (node) =>
      (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) &&
      isNamed(node.expression, context.name) &&
      contains(value, node),
  );
  const first = spreads.reduce<Node | undefined>(
    (best, node) => (best === undefined || node.pos < best.pos ? node : best),
    undefined,
  );
  return SHAPE_KINDS.has(value.kind) && inLoop ? first : undefined;
}

function letScope(
  spread: Node,
  name: string,
): { readonly scope: Node; readonly list: TypeScript.VariableDeclarationList } | undefined {
  const scope = chainOf<Node>(spread, parentOf).find(
    (node) => declaringList(node, name) !== undefined,
  );
  const list = scope === undefined ? undefined : declaringList(scope, name);
  return scope !== undefined &&
    list !== undefined &&
    list !== OTHER &&
    (list.flags & ts.NodeFlags.Let) !== 0
    ? { scope, list }
    : undefined;
}

export function loopSpreadSites(spread: Node): readonly Node[] {
  const name =
    ts.isSpreadElement(spread) || ts.isSpreadAssignment(spread) ? spread.expression : undefined;
  const declared =
    name === undefined || !ts.isIdentifier(name) ? undefined : letScope(spread, name.text);
  if (name === undefined || !ts.isIdentifier(name) || declared === undefined) {
    return [];
  }
  const nodes = scan(declared.scope, name.text);
  if (nodes.some((node) => otherWrite(node, nodes, name.text))) {
    return [];
  }
  const context = { nodes, name: name.text, list: declared.list };
  const sites = nodes
    .filter(isAssignment)
    .filter((node) => isNamed(unwrapped(node.left), name.text))
    .map((assignment) => spreadSite(assignment, context));
  const spreads = sites.filter((site) => site !== undefined);
  return spreads.length === sites.length ? spreads : [];
}
