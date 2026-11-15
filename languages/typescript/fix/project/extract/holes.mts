import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { eachSide, type Both, type Hole, type HoleEnv, type Side } from './typed/extract-types.mts';
import { declarationsOf, isInRegion, isLocalSymbol, isWithin } from './scope.mts';
import {
  descendants,
  isLiteralValue,
  isValuePosition,
  normalizedText,
  roleOf,
  symbolAt,
} from './syntax.mts';

const ts = typescriptApi();

const SUSPENDING = [ts.SyntaxKind.AwaitExpression, ts.SyntaxKind.YieldExpression];

function referencedSymbols(
  node: TypeScript.Node,
  env: Pick<HoleEnv, 'checker'>,
): (TypeScript.Symbol | undefined)[] {
  return descendants(node)
    .filter((part) => ts.isIdentifier(part) && roleOf(part) === 'reference')
    .map((part) => symbolAt(part, env.checker));
}

function readsRegionLocal(node: TypeScript.Node, side: Side, env: HoleEnv): boolean {
  return referencedSymbols(node, env).some(
    (symbol) => isInRegion(symbol, env.regions[side]) && !declaredInside(symbol, node),
  );
}

function declaredInside(symbol: TypeScript.Symbol | undefined, node: TypeScript.Node): boolean {
  return declarationsOf(symbol).some((declaration) => isWithin(declaration, node));
}

function readsWrittenInput(node: TypeScript.Node, side: Side, env: HoleEnv): boolean {
  return referencedSymbols(node, env).some(
    (symbol) => isLocalSymbol(symbol, env.units[side]) && env.regionWrites[side].has(symbol),
  );
}

function holeProblem(node: TypeScript.Node, side: Side, env: HoleEnv): string | undefined {
  if (descendants(node).some((part) => SUSPENDING.includes(part.kind))) {
    return 'a differing value awaits or yields';
  }
  if (readsRegionLocal(node, side, env)) {
    return 'a differing value reads a local of the copied code';
  }
  return readsWrittenInput(node, side, env)
    ? 'a differing value reads a variable the copied code writes'
    : undefined;
}

function isStableInput(node: TypeScript.Node, side: Side, env: HoleEnv): boolean {
  const symbol = ts.isIdentifier(node) ? env.checker.getSymbolAtLocation(node) : undefined;
  return (
    isLocalSymbol(symbol, env.units[side]) &&
    !isInRegion(symbol, env.regions[side]) &&
    !env.written[side].has(symbol)
  );
}

function kindOf(pair: Both<TypeScript.Node>, env: HoleEnv): Hole['kind'] {
  if (pair.every((node) => isLiteralValue(node))) {
    return 'literal';
  }
  return eachSide(pair, (node, side) => isStableInput(node, side, env)).every(Boolean)
    ? 'parameter'
    : 'thunk';
}

export function addHole(env: HoleEnv, x: TypeScript.Node, y: TypeScript.Node): string | undefined {
  const pair: Both<TypeScript.Node> = [x, y];
  if (!pair.every((node) => isValuePosition(node))) {
    return 'the copies differ in a part that is not a plain value';
  }
  const problem = eachSide(pair, (node, side) => holeProblem(node, side, env)).find(
    (found) => found !== undefined,
  );
  if (problem !== undefined) {
    return problem;
  }
  const key = pair.map((node) => normalizedText(node, env.sourceFile)).join('\u0000');
  const occurrence = { a: x, b: y };
  const hole = env.holes.get(key);
  if (hole === undefined) {
    env.holes.set(key, { key, kind: kindOf(pair, env), occurrences: [occurrence] });
  } else {
    hole.occurrences.push(occurrence);
  }
  return undefined;
}
