import type TypeScript from 'typescript';
import {
  chainOf,
  childrenOf,
  typescriptApi,
} from '../../../../adapters/typed/typescript-program.mts';
import { declarationsOf, isInRegion, isLocalSymbol, isWithin } from '../scope.mts';
import { descendants, symbolAt } from '../syntax.mts';
import type { Region, RunOutput, RunSide, SymbolSet } from '../typed/extract-types.mts';
import { writesOf } from '../writes.mts';
import { isFunctionLike, lastStatement } from './runs.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type Analysis =
  | { readonly problem: string; readonly output?: undefined }
  | { readonly output: RunOutput; readonly problem?: undefined };

type Used = {
  readonly declaration: TypeScript.VariableDeclaration;
  readonly where: string;
  readonly name: TypeScript.Identifier;
};

const ts = typescriptApi();

const LOOPS = [
  ts.isForStatement,
  ts.isForInStatement,
  ts.isForOfStatement,
  ts.isWhileStatement,
  ts.isDoStatement,
];

const ALLOWED_STATEMENTS = [
  ts.isVariableStatement,
  ts.isExpressionStatement,
  ts.isIfStatement,
  ts.isTryStatement,
  ts.isThrowStatement,
  ts.isReturnStatement,
  ts.isBlock,
  ts.isSwitchStatement,
  ...LOOPS,
];

const SUSPENDING = [ts.SyntaxKind.AwaitExpression, ts.SyntaxKind.YieldExpression];
const BOTH = 'the run returns a value and also defines one that the code after it uses';
const EARLY = 'the run returns early on some paths';

export function ownNodes(statements: readonly TypeScript.Node[]): TypeScript.Node[] {
  const found: TypeScript.Node[] = [];
  const pending = [...statements];
  for (const node of pending) {
    found.push(node);
    if (!isFunctionLike(node)) {
      appendAll(pending, childrenOf(node));
    }
  }
  return found;
}

function enclosingWithin(
  node: TypeScript.Node,
  statements: readonly TypeScript.Node[],
): TypeScript.Node[] {
  if (statements.includes(node)) {
    return [];
  }
  const found: TypeScript.Node[] = [];
  const pending = [node.parent];
  for (const current of pending) {
    found.push(current);
    if (!statements.includes(current)) {
      pending.push(current.parent);
    }
  }
  return found;
}

function hasTarget(node: TypeScript.Node, statements: readonly TypeScript.Node[]): boolean {
  const wanted = ts.isBreakStatement(node) ? [...LOOPS, ts.isSwitchStatement] : LOOPS;
  return enclosingWithin(node, statements).some((ancestor) =>
    wanted.some((test) => test(ancestor)),
  );
}

function isSuspending(node: TypeScript.Node): boolean {
  const awaitsLoop = ts.isForOfStatement(node) && node.awaitModifier !== undefined;
  return awaitsLoop || SUSPENDING.includes(node.kind);
}

function jumpProblem(
  node: TypeScript.Node,
  statements: readonly TypeScript.Node[],
): string | undefined {
  if (ts.isReturnStatement(node)) {
    const final = node === statements.at(-1) && node.expression !== undefined;
    return final ? undefined : EARLY;
  }
  if (ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
    const inside = node.label === undefined && hasTarget(node, statements);
    return inside ? undefined : 'the run jumps out of itself';
  }
  return isSuspending(node) ? 'the run awaits or yields' : undefined;
}

function isVar(node: TypeScript.Node): boolean {
  return ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0;
}

function shapeProblem(statements: readonly TypeScript.Node[]): string | undefined {
  if (!statements.every((statement) => ALLOWED_STATEMENTS.some((test) => test(statement)))) {
    return 'the run declares a function, class or type, or has a statement of another kind';
  }
  const nodes = ownNodes(statements);
  const jump = nodes.map((node) => jumpProblem(node, statements)).find(Boolean);
  return jump ?? (nodes.some(isVar) ? 'the run declares a var' : undefined);
}

function writeProblem({ unit, checker, region }: RunSide): string | undefined {
  const outside = writesOf(unit, checker).some(
    ({ node, symbol }) =>
      isWithin(node, region) && isLocalSymbol(symbol, unit) && !isInRegion(symbol, region),
  );
  return outside ? 'the run writes a variable declared before it' : undefined;
}

function capturedProblem(
  { statements, unit, checker, region }: RunSide,
  written: SymbolSet,
): string | undefined {
  const closures = statements.flatMap((statement) => descendants(statement)).filter(isFunctionLike);
  const captured = closures
    .flatMap((closure) => descendants(closure))
    .filter((node) => ts.isIdentifier(node))
    .map((node) => symbolAt(node, checker))
    .some(
      (symbol) => written.has(symbol) && isLocalSymbol(symbol, unit) && !isInRegion(symbol, region),
    );
  return captured ? 'a closure in the run reads a variable that changes outside it' : undefined;
}

const CALLS = [ts.isCallExpression, ts.isNewExpression, ts.isTaggedTemplateExpression];

function insideClosure(node: TypeScript.Node, root: TypeScript.Node): boolean {
  return chainOf<TypeScript.Node>(node, (current) =>
    current.parent === root ? undefined : current.parent,
  )
    .slice(1)
    .some(isFunctionLike);
}

function changedByClosure({ unit, checker }: RunSide): SymbolSet {
  return new Set(
    writesOf(unit, checker)
      .filter(({ node }) => insideClosure(node, unit))
      .map(({ symbol }) => symbol),
  );
}

function callProblem(side: RunSide): string | undefined {
  const nodes = side.statements.flatMap((statement) => descendants(statement));
  const calls = nodes.some((node) => CALLS.some((test) => test(node)));
  const changing = changedByClosure(side);
  const reads = nodes
    .filter((node) => ts.isIdentifier(node))
    .map((node) => symbolAt(node, side.checker))
    .some(
      (symbol) =>
        changing.has(symbol) &&
        isLocalSymbol(symbol, side.unit) &&
        !isInRegion(symbol, side.region),
    );
  return calls && reads ? 'a call in the run can change a variable that the run reads' : undefined;
}

function isConstDeclaration(declaration: TypeScript.Node): boolean {
  const node =
    chainOf<TypeScript.Node>(declaration, (current) =>
      ts.isBindingElement(current) ||
      ts.isObjectBindingPattern(current) ||
      ts.isArrayBindingPattern(current)
        ? current.parent
        : undefined,
    ).at(-1) ?? declaration;
  return ts.isVariableDeclaration(node) && (node.parent.flags & ts.NodeFlags.Const) !== 0;
}

function declaredByRunBody(declaration: TypeScript.Node, region: Region): boolean {
  const enclosing = chainOf<TypeScript.Node>(declaration.parent, (current) =>
    isWithin(current, region) ? current.parent : undefined,
  );
  return (
    isWithin(declaration, region) &&
    !enclosing.some((node) => isWithin(node, region) && isFunctionLike(node))
  );
}

function closureProblem({ statements, checker, region }: RunSide): string | undefined {
  const closures = statements.flatMap((statement) => descendants(statement)).filter(isFunctionLike);
  const escaping = closures
    .flatMap((closure) => descendants(closure))
    .filter((node) => ts.isIdentifier(node))
    .flatMap((node) => declarationsOf(symbolAt(node, checker)))
    .some(
      (declaration) => declaredByRunBody(declaration, region) && !isConstDeclaration(declaration),
    );
  return escaping ? 'a closure in the run uses a variable that the run declares' : undefined;
}

function bindingNames(declaration: TypeScript.VariableDeclaration): TypeScript.Identifier[] {
  const { name } = declaration;
  if (ts.isIdentifier(name)) {
    return [name];
  }
  return descendants(name).filter(
    (node): node is TypeScript.Identifier =>
      ts.isIdentifier(node) && ts.isBindingElement(node.parent) && node.parent.name === node,
  );
}

function declaredByRun(
  statements: readonly TypeScript.Statement[],
): { declaration: TypeScript.VariableDeclaration; where: string }[] {
  return statements.flatMap((statement, index) =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.map((declaration, position) => ({
          declaration,
          where: `${String(index)}:${String(position)}`,
        }))
      : [],
  );
}

function usedAfter({ statements, unit, checker, region }: RunSide): Used[] {
  const references = descendants(unit.body ?? unit).filter(
    (node) => ts.isIdentifier(node) && !isWithin(node, region),
  );
  const symbols = new Set(references.map((node) => symbolAt(node, checker)));
  return declaredByRun(statements).flatMap(({ declaration, where }) =>
    bindingNames(declaration)
      .filter((name) => symbols.has(checker.getSymbolAtLocation(name)))
      .map((name) => ({ declaration, where, name })),
  );
}

function valueOutput({ declaration, where, name }: Used): Analysis {
  if (!ts.isIdentifier(declaration.name)) {
    return { problem: 'the run defines a destructured value that the code after it uses' };
  }
  const isConst = (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
  return {
    output: {
      kind: 'value',
      where,
      name: name.text,
      keyword: isConst ? 'const' : 'let',
      typeText: declaration.type?.getText(),
    },
  };
}

function outputOf(side: RunSide): Analysis {
  const endsWithReturn = ts.isReturnStatement(lastStatement(side.statements));
  const used = usedAfter(side);
  const [only] = used;
  if (used.length > 1) {
    return { problem: 'the run defines more than one value that the code after it uses' };
  }
  if (only !== undefined) {
    return endsWithReturn ? { problem: BOTH } : valueOutput(only);
  }
  return { output: { kind: endsWithReturn ? 'return' : 'none' } };
}

export function runAnalysis(side: RunSide, written: SymbolSet): Analysis {
  const problem =
    shapeProblem(side.statements) ??
    writeProblem(side) ??
    capturedProblem(side, written) ??
    callProblem(side) ??
    closureProblem(side);
  return problem === undefined ? outputOf(side) : { problem };
}
