import { ts } from '../../../typescript-api/typescript-api.mjs';
import { bindPair } from '../../../../../shared/fix/recipes/extract/bijection.mjs';
import { addHole } from './holes.mjs';
import { isInRegion, isLocalSymbol } from './scope.mjs';
import { childrenOf, normalizedText, roleOf, symbolAt } from './syntax.mjs';

const SHAPE = 'the copies are shaped differently';
const FLAGS_MASK = ts.NodeFlags.BlockScoped;
const NAMELESS_ROLES = ['member', 'other'];

function scalarProblem(x, y) {
  const unary = ts.isPrefixUnaryExpression(x) || ts.isPostfixUnaryExpression(x);
  if (unary && x.operator !== y.operator) {
    return 'the copies use different operators';
  }
  const declares = ts.isVariableDeclarationList(x);
  return declares && (x.flags & FLAGS_MASK) !== (y.flags & FLAGS_MASK)
    ? 'the copies declare variables differently'
    : undefined;
}

function localStep(env, x, y) {
  const [left, right] = [x, y].map((node) => symbolAt(node, env.checker));
  const inside = [isInRegion(left, env.regions[0]), isInRegion(right, env.regions[1])];
  if (inside[0] !== inside[1]) {
    return 'one copy names a local of the copied code where the other names a local outside it';
  }
  if (roleOf(x) === 'shorthand' && x.text !== y.text) {
    return 'the copies use different property names';
  }
  if (!(inside[0] || env.inputs.has(left))) {
    env.inputs.set(left, { symbol: right, nodes: [x, y] });
  }
  return bindPair(env, left, right) ? undefined : 'the copies rename a local inconsistently';
}

function outerStep(env, x, y) {
  if (x.text !== y.text) {
    return roleOf(x) === 'reference' ? addHole(env, x, y) : 'a differing name is not a value';
  }
  const [left, right] = [x, y].map((node) => symbolAt(node, env.checker));
  return left === right ? undefined : 'a name means something else in each copy';
}

function identifierStep(env, x, y) {
  const role = roleOf(x);
  if (role !== roleOf(y)) {
    return SHAPE;
  }
  if (NAMELESS_ROLES.includes(role)) {
    return x.text === y.text ? undefined : 'the copies use different property or label names';
  }
  const locals = [x, y].map((node, side) =>
    isLocalSymbol(symbolAt(node, env.checker), env.units[side]),
  );
  if (locals[0] !== locals[1]) {
    return 'one copy names a local where the other names an outer value';
  }
  return locals[0] ? localStep(env, x, y) : outerStep(env, x, y);
}

function leafStep(env, x, y) {
  const same = x.getText(env.sourceFile) === y.getText(env.sourceFile);
  return same ? undefined : addHole(env, x, y);
}

function step(env, x, y) {
  if (x.kind !== y.kind) {
    return addHole(env, x, y);
  }
  if (ts.isTypeNode(x)) {
    const same = normalizedText(x, env.sourceFile) === normalizedText(y, env.sourceFile);
    return same ? undefined : 'the copies use different types';
  }
  if (ts.isIdentifier(x)) {
    return identifierStep(env, x, y);
  }
  const [left, right] = [childrenOf(x), childrenOf(y)];
  if (left.length === 0 && right.length === 0) {
    return leafStep(env, x, y);
  }
  if (left.length !== right.length) {
    return SHAPE;
  }
  env.pending.push(...left.map((child, index) => [child, right[index]]));
  return scalarProblem(x, y);
}

export function alignRegions(pairs, shared) {
  const env = {
    ...shared,
    forward: new Map(),
    backward: new Map(),
    holes: new Map(),
    inputs: new Map(),
    pending: [...pairs],
  };
  for (const [x, y] of env.pending) {
    const problem = step(env, x, y);
    if (problem !== undefined) {
      return { declined: problem };
    }
  }
  return { holes: [...env.holes.values()], inputs: [...env.inputs.values()] };
}
