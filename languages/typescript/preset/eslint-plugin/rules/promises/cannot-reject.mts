import type { ParserServicesWithTypeInformation, TSESLint } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import type { SourceCode } from '../typed/node-views.mts';
import { partsOf } from '../analysis/narrowing/type-parts.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type SkipOuterExpressions = {
  readonly skipOuterExpressions: (node: TypeScript.Node) => TypeScript.Node;
};

function hasSkipOuterExpressions(value: unknown): value is SkipOuterExpressions {
  return (
    typeof value === 'object' &&
    value !== null &&
    'skipOuterExpressions' in value &&
    typeof value.skipOuterExpressions === 'function'
  );
}

function skipOuterExpressions(node: TypeScript.Node): TypeScript.Node {
  return hasSkipOuterExpressions(ts) ? ts.skipOuterExpressions(node) : node;
}

export function hasTypeInformation(
  services: SourceCode['parserServices'],
): services is ParserServicesWithTypeInformation {
  return (
    services?.program !== null &&
    services?.program !== undefined &&
    services.esTreeNodeToTSNodeMap !== undefined
  );
}

export type TypedScope<MessageIds extends string> = {
  readonly context: Readonly<TSESLint.RuleContext<MessageIds, []>>;
  readonly sourceCode: SourceCode;
  readonly services: ParserServicesWithTypeInformation;
};

export type TypedFacts = Pick<TypedScope<string>, 'services' | 'sourceCode'>;

export function typedScopeOf<MessageIds extends string>(
  context: Readonly<TSESLint.RuleContext<MessageIds, []>>,
): TypedScope<MessageIds> | undefined {
  const { sourceCode } = context;
  const services = sourceCode.parserServices;
  return hasTypeInformation(services) ? { context, sourceCode, services } : undefined;
}

export function isThenable(checker: TypeScript.TypeChecker, node: TypeScript.Node): boolean {
  return partsOf(checker.getTypeAtLocation(node)).some((part) => {
    const then = checker.getApparentType(part).getProperty('then');
    return (
      then !== undefined &&
      checker.getTypeOfSymbolAtLocation(then, node).getCallSignatures().length > 0
    );
  });
}

function isAsync(fn: TypeScript.FunctionLikeDeclaration): boolean {
  return (fn.modifiers ?? []).some(({ kind }) => kind === ts.SyntaxKind.AsyncKeyword);
}

function maskedFlags(
  flags: TypeScript.NodeFlags,
  mask: TypeScript.NodeFlags,
): TypeScript.NodeFlags {
  return flags & mask;
}

function isConstant(declaration: TypeScript.VariableDeclaration): boolean {
  return (
    ts.isVariableDeclarationList(declaration.parent) &&
    maskedFlags(declaration.parent.flags, ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const
  );
}

function isInitialized(
  declaration: TypeScript.Declaration,
): declaration is
  TypeScript.VariableDeclaration | TypeScript.PropertyDeclaration | TypeScript.PropertyAssignment {
  return (
    (ts.isVariableDeclaration(declaration) && isConstant(declaration)) ||
    ts.isPropertyDeclaration(declaration) ||
    ts.isPropertyAssignment(declaration)
  );
}

function functionOf(
  declaration: TypeScript.Declaration,
): TypeScript.FunctionLikeDeclaration | undefined {
  const fn = isInitialized(declaration)
    ? declaration.initializer && skipOuterExpressions(declaration.initializer)
    : declaration;
  return fn !== undefined && ts.isFunctionLike(fn) && 'body' in fn ? fn : undefined;
}

function isBoundary(node: TypeScript.Node): boolean {
  return ts.isFunctionLike(node) || ts.isClassLike(node);
}

function returnsPromise(checker: TypeScript.TypeChecker, node: TypeScript.Node): boolean {
  return (
    ts.isReturnStatement(node) &&
    node.expression !== undefined &&
    !ts.isAwaitExpression(skipOuterExpressions(node.expression)) &&
    isThenable(checker, node.expression)
  );
}

function dropsPromise(checker: TypeScript.TypeChecker, node: TypeScript.Node): boolean {
  return ts.isExpressionStatement(node) && isThenable(checker, node.expression);
}

function isAwaitUsing(node: TypeScript.Node): boolean {
  return (
    ts.isVariableDeclarationList(node) &&
    maskedFlags(node.flags, ts.NodeFlags.AwaitUsing) === ts.NodeFlags.AwaitUsing
  );
}

function raises(checker: TypeScript.TypeChecker, node: TypeScript.Node): boolean {
  return (
    ts.isThrowStatement(node) ||
    ts.isAwaitExpression(node) ||
    isAwaitUsing(node) ||
    (ts.isForOfStatement(node) && node.awaitModifier !== undefined) ||
    returnsPromise(checker, node) ||
    dropsPromise(checker, node)
  );
}

function guardedParts(node: TypeScript.TryStatement): TypeScript.Block[] {
  return [node.catchClause?.block, node.finallyBlock].filter((part) => part !== undefined);
}

function anyInside(
  root: TypeScript.Node,
  matches: (node: TypeScript.Node) => boolean,
  guards: boolean,
): boolean {
  const pending = [root];
  for (const node of pending) {
    if (matches(node)) {
      return true;
    }
    if (guards && ts.isTryStatement(node) && node.catchClause !== undefined) {
      appendAll(pending, guardedParts(node));
    } else if (node === root || !isBoundary(node)) {
      ts.forEachChild(node, (child) => {
        pending.push(child);
      });
    }
  }
  return false;
}

function isCatchingStatement(
  checker: TypeScript.TypeChecker,
  statement: TypeScript.Statement,
): boolean {
  return (
    ts.isTryStatement(statement) &&
    statement.catchClause !== undefined &&
    !anyInside(statement.tryBlock, (node) => returnsPromise(checker, node), false) &&
    !guardedParts(statement).some((part) => anyInside(part, (node) => raises(checker, node), true))
  );
}

function isCatchingFunction(
  checker: TypeScript.TypeChecker,
  fn: TypeScript.FunctionLikeDeclaration,
): boolean {
  return (
    isAsync(fn) &&
    fn.body !== undefined &&
    ts.isBlock(fn.body) &&
    fn.body.statements.length > 0 &&
    fn.body.statements.every((statement) => isCatchingStatement(checker, statement))
  );
}

function calleeDeclarations(
  checker: TypeScript.TypeChecker,
  callee: TypeScript.Node,
): readonly TypeScript.Declaration[] {
  const named = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
  const symbol = checker.getSymbolAtLocation(named);
  const target =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return target?.declarations ?? [];
}

export function calleeCannotReject(
  checker: TypeScript.TypeChecker,
  callee: TypeScript.Node,
): boolean {
  const inner = skipOuterExpressions(callee);
  if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) {
    return isCatchingFunction(checker, inner);
  }
  const implementations = calleeDeclarations(checker, inner).flatMap((declaration) => {
    const fn = functionOf(declaration);
    return fn?.body === undefined ? [] : [fn];
  });
  return (
    implementations.length > 0 && implementations.every((fn) => isCatchingFunction(checker, fn))
  );
}
