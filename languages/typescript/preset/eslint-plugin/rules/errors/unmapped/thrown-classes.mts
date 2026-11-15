import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import { classDeclarationOf, isProjectDeclaration } from './nest-classes.mts';

type BodiedFunction = TypeScript.SignatureDeclaration & { readonly body: TypeScript.Node };
type WalkItem = {
  readonly declaration: BodiedFunction;
  readonly path: readonly string[];
  readonly depth: number;
};
type Walk = {
  readonly checker: TypeScript.TypeChecker;
  readonly thrown: Map<TypeScript.ClassLikeDeclaration, readonly string[]>;
  readonly seen: Set<BodiedFunction>;
  readonly pending: WalkItem[];
};

const MAX_DEPTH = 4;
const MAX_FUNCTIONS = 200;

export function isBodiedFunction(node: TypeScript.Node): node is BodiedFunction {
  return (
    !ts.isJSDocSignature(node) &&
    ts.isFunctionLike(node) &&
    'body' in node &&
    node.body !== undefined
  );
}

function functionLabel(declaration: BodiedFunction): string {
  const name = declaration.name?.getText() ?? 'anonymous function';
  const owner = ts.isClassLike(declaration.parent) ? declaration.parent.name?.text : undefined;
  return owner === undefined ? name : `${owner}.${name}`;
}

function calledFunction(
  checker: TypeScript.TypeChecker,
  call: TypeScript.CallExpression | TypeScript.NewExpression,
): BodiedFunction | undefined {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  return declaration !== undefined &&
    isBodiedFunction(declaration) &&
    isProjectDeclaration(declaration)
    ? declaration
    : undefined;
}

function isStoredFunction(node: TypeScript.Node): boolean {
  if (ts.isFunctionDeclaration(node) || ts.isClassLike(node)) {
    return true;
  }
  const isFunction = ts.isArrowFunction(node) || ts.isFunctionExpression(node);
  return (
    isFunction && (ts.isVariableDeclaration(node.parent) || ts.isPropertyAssignment(node.parent))
  );
}

function isCaughtReceiver(node: TypeScript.Node): boolean {
  const { parent } = node;
  return (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    parent.name.text === 'catch' &&
    ts.isCallExpression(parent.parent) &&
    parent.parent.expression === parent
  );
}

function childrenOf(node: TypeScript.Node): TypeScript.Node[] {
  if (ts.isTryStatement(node) && node.catchClause !== undefined) {
    return [node.catchClause, node.finallyBlock].filter((child) => child !== undefined);
  }
  const children: TypeScript.Node[] = [];
  node.forEachChild((child) => {
    if (!(isStoredFunction(child) || isCaughtReceiver(child))) {
      children.push(child);
    }
  });
  return children;
}

function withoutParentheses(node: TypeScript.Expression): TypeScript.Expression {
  const chain = [node];
  for (const current of chain) {
    if (ts.isParenthesizedExpression(current)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1) ?? node;
}

function thrownClass(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.ClassLikeDeclaration | undefined {
  if (!ts.isThrowStatement(node)) {
    return undefined;
  }
  const expression = withoutParentheses(node.expression);
  const declaration = ts.isNewExpression(expression)
    ? classDeclarationOf(checker, expression)
    : undefined;
  return declaration !== undefined && isProjectDeclaration(declaration) ? declaration : undefined;
}

function visitBody(walk: Walk, item: WalkItem): void {
  const nodes = [item.declaration.body];
  for (const node of nodes) {
    const thrown = thrownClass(walk.checker, node);
    if (thrown !== undefined && !walk.thrown.has(thrown)) {
      walk.thrown.set(thrown, item.path);
    }
    const isCall = ts.isCallExpression(node) || ts.isNewExpression(node);
    const callee = isCall ? calledFunction(walk.checker, node) : undefined;
    if (callee !== undefined && item.depth < MAX_DEPTH && !walk.seen.has(callee)) {
      walk.seen.add(callee);
      const path = [...item.path, functionLabel(callee)];
      walk.pending.push({ declaration: callee, path, depth: item.depth + 1 });
    }
    nodes.push(...childrenOf(node));
  }
}

export function thrownClasses(
  checker: TypeScript.TypeChecker,
  handler: BodiedFunction,
): ReadonlyMap<TypeScript.ClassLikeDeclaration, readonly string[]> {
  const walk: Walk = {
    checker,
    thrown: new Map(),
    seen: new Set([handler]),
    pending: [{ declaration: handler, path: [], depth: 0 }],
  };
  for (const item of walk.pending) {
    if (walk.seen.size > MAX_FUNCTIONS) {
      break;
    }
    visitBody(walk, item);
  }
  return walk.thrown;
}

export function pathText(path: readonly string[]): string {
  return path.length === 0 ? '' : ` (through ${path.map((step) => `\`${step}\``).join(', ')})`;
}
