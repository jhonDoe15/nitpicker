import { ts } from '../../../typescript-api/typescript-api.mjs';
import { declarationsOf, isInRegion, isLocalSymbol, isWithin } from './scope.mjs';
import {
  descendants,
  isLiteralValue,
  isValuePosition,
  normalizedText,
  roleOf,
  symbolAt,
} from './syntax.mjs';

const SUSPENDING = [ts.SyntaxKind.AwaitExpression, ts.SyntaxKind.YieldExpression];

function referencedSymbols(node, env) {
  return descendants(node)
    .filter((part) => ts.isIdentifier(part) && roleOf(part) === 'reference')
    .map((part) => symbolAt(part, env.checker));
}

function readsRegionLocal(node, side, env) {
  return referencedSymbols(node, env).some(
    (symbol) => isInRegion(symbol, env.regions[side]) && !declaredInside(symbol, node),
  );
}

function declaredInside(symbol, node) {
  return declarationsOf(symbol).some((declaration) => isWithin(declaration, node));
}

function readsWrittenInput(node, side, env) {
  return referencedSymbols(node, env).some(
    (symbol) => isLocalSymbol(symbol, env.units[side]) && env.regionWrites[side].has(symbol),
  );
}

function holeProblem(node, side, env) {
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

function isStableInput(node, side, env) {
  const symbol = ts.isIdentifier(node) ? env.checker.getSymbolAtLocation(node) : undefined;
  return (
    isLocalSymbol(symbol, env.units[side]) &&
    !isInRegion(symbol, env.regions[side]) &&
    !env.written[side].has(symbol)
  );
}

function kindOf(pair, env) {
  if (pair.every((node) => isLiteralValue(node))) {
    return 'literal';
  }
  return pair.every((node, side) => isStableInput(node, side, env)) ? 'parameter' : 'thunk';
}

export function addHole(env, x, y) {
  const pair = [x, y];
  if (!pair.every((node) => isValuePosition(node))) {
    return 'the copies differ in a part that is not a plain value';
  }
  const problem = pair
    .map((node, side) => holeProblem(node, side, env))
    .find((found) => found !== undefined);
  if (problem !== undefined) {
    return problem;
  }
  const key = pair.map((node) => normalizedText(node, env.sourceFile)).join('\u0000');
  const hole = env.holes.get(key) ?? { key, kind: kindOf(pair, env), occurrences: [] };
  hole.occurrences.push({ a: x, b: y });
  env.holes.set(key, hole);
  return undefined;
}
