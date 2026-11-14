import { chainOf } from '../../../../../../shared/traversal.mjs';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { declarationsOf, isInRegion, isLocalSymbol, isWithin } from '../scope.mjs';
import { childrenOf, descendants, symbolAt } from '../syntax.mjs';
import { writesOf } from '../writes.mjs';
import { isFunctionLike } from './runs.mjs';

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

export function ownNodes(statements) {
  const found = [];
  const pending = [...statements];
  for (const node of pending) {
    found.push(node);
    if (!isFunctionLike(node)) {
      pending.push(...childrenOf(node));
    }
  }
  return found;
}

function enclosingWithin(node, statements) {
  if (statements.includes(node)) {
    return [];
  }
  const found = [];
  const pending = [node.parent];
  for (const current of pending) {
    found.push(current);
    if (!statements.includes(current)) {
      pending.push(current.parent);
    }
  }
  return found;
}

function hasTarget(node, statements) {
  const wanted = ts.isBreakStatement(node) ? [...LOOPS, ts.isSwitchStatement] : LOOPS;
  return enclosingWithin(node, statements).some((ancestor) =>
    wanted.some((test) => test(ancestor)),
  );
}

function isSuspending(node) {
  const awaitsLoop = ts.isForOfStatement(node) && node.awaitModifier !== undefined;
  return awaitsLoop || SUSPENDING.includes(node.kind);
}

function jumpProblem(node, statements) {
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

function isVar(node) {
  return ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0;
}

function shapeProblem(statements) {
  if (!statements.every((statement) => ALLOWED_STATEMENTS.some((test) => test(statement)))) {
    return 'the run declares a function, class or type, or has a statement of another kind';
  }
  const nodes = ownNodes(statements);
  const jump = nodes.map((node) => jumpProblem(node, statements)).find(Boolean);
  return jump ?? (nodes.some(isVar) ? 'the run declares a var' : undefined);
}

function writeProblem({ unit, checker, region }) {
  const outside = writesOf(unit, checker).some(
    ({ node, symbol }) =>
      isWithin(node, region) && isLocalSymbol(symbol, unit) && !isInRegion(symbol, region),
  );
  return outside ? 'the run writes a variable declared before it' : undefined;
}

function capturedProblem({ statements, unit, checker, region }, written) {
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

function insideClosure(node, root) {
  return chainOf(node, (current) => (current.parent === root ? undefined : current.parent))
    .slice(1)
    .some(isFunctionLike);
}

function changedByClosure({ unit, checker }) {
  return new Set(
    writesOf(unit, checker)
      .filter(({ node }) => insideClosure(node, unit))
      .map(({ symbol }) => symbol),
  );
}

function callProblem(side) {
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

function isConstDeclaration(declaration) {
  const node = chainOf(declaration, (current) =>
    ts.isBindingElement(current) ||
    ts.isObjectBindingPattern(current) ||
    ts.isArrayBindingPattern(current)
      ? current.parent
      : undefined,
  ).at(-1);
  return ts.isVariableDeclaration(node) && (node.parent.flags & ts.NodeFlags.Const) !== 0;
}

function declaredByRunBody(declaration, region) {
  const enclosing = chainOf(declaration.parent, (current) =>
    isWithin(current, region) ? current.parent : undefined,
  );
  return (
    isWithin(declaration, region) &&
    !enclosing.some((node) => isWithin(node, region) && isFunctionLike(node))
  );
}

function closureProblem({ statements, checker, region }) {
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

function bindingNames(declaration) {
  const { name } = declaration;
  if (ts.isIdentifier(name)) {
    return [name];
  }
  return descendants(name).filter(
    (node) =>
      ts.isIdentifier(node) && ts.isBindingElement(node.parent) && node.parent.name === node,
  );
}

function declaredByRun(statements) {
  return statements.flatMap((statement, index) =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.map((declaration, position) => ({
          declaration,
          where: `${index}:${position}`,
        }))
      : [],
  );
}

function usedAfter({ statements, unit, checker, region }) {
  const references = descendants(unit.body).filter(
    (node) => ts.isIdentifier(node) && !isWithin(node, region),
  );
  const symbols = new Set(references.map((node) => symbolAt(node, checker)));
  return declaredByRun(statements).flatMap(({ declaration, where }) =>
    bindingNames(declaration)
      .filter((name) => symbols.has(checker.getSymbolAtLocation(name)))
      .map((name) => ({ declaration, where, name })),
  );
}

function valueOutput([{ declaration, where, name }]) {
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

function outputOf(side) {
  const endsWithReturn = ts.isReturnStatement(side.statements.at(-1));
  const used = usedAfter(side);
  if (used.length > 1) {
    return { problem: 'the run defines more than one value that the code after it uses' };
  }
  if (used.length === 1) {
    return endsWithReturn ? { problem: BOTH } : valueOutput(used);
  }
  return { output: { kind: endsWithReturn ? 'return' : 'none' } };
}

export function runAnalysis(side, written) {
  const problem =
    shapeProblem(side.statements) ??
    writeProblem(side) ??
    capturedProblem(side, written) ??
    callProblem(side) ??
    closureProblem(side);
  return problem === undefined ? outputOf(side) : { problem };
}
