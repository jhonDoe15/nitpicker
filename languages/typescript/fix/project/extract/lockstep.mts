import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import {
  eachSide,
  paired,
  type AlignEnv,
  type Aligned,
  type Both,
  type SharedEnv,
} from './typed/extract-types.mts';
import { bindPair } from './typed/typed-views.mts';
import { addHole } from './holes.mts';
import { isInRegion, isLocalSymbol } from './scope.mts';
import { childrenOf, normalizedText, roleOf, symbolAt } from './syntax.mts';

const ts = typescriptApi();

const SHAPE = 'the copies are shaped differently';
const FLAGS_MASK = ts.NodeFlags.BlockScoped;
const NAMELESS_ROLES = ['member', 'other'];

function scalarProblem(x: TypeScript.Node, y: TypeScript.Node): string | undefined {
  const unary = ts.isPrefixUnaryExpression(x) || ts.isPostfixUnaryExpression(x);
  if (unary && x.operator !== fieldOf(y, 'operator')) {
    return 'the copies use different operators';
  }
  const declares = ts.isVariableDeclarationList(x);
  return declares && (x.flags & FLAGS_MASK) !== (y.flags & FLAGS_MASK)
    ? 'the copies declare variables differently'
    : undefined;
}

function localStep(
  env: AlignEnv,
  x: TypeScript.Identifier,
  y: TypeScript.Identifier,
): string | undefined {
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

function outerStep(
  env: AlignEnv,
  x: TypeScript.Identifier,
  y: TypeScript.Identifier,
): string | undefined {
  if (x.text !== y.text) {
    return roleOf(x) === 'reference' ? addHole(env, x, y) : 'a differing name is not a value';
  }
  const [left, right] = [x, y].map((node) => symbolAt(node, env.checker));
  return left === right ? undefined : 'a name means something else in each copy';
}

function identifierStep(
  env: AlignEnv,
  x: TypeScript.Identifier,
  y: TypeScript.Identifier,
): string | undefined {
  const role = roleOf(x);
  if (role !== roleOf(y)) {
    return SHAPE;
  }
  if (NAMELESS_ROLES.includes(role)) {
    return x.text === y.text ? undefined : 'the copies use different property or label names';
  }
  const locals = eachSide<TypeScript.Node, boolean>([x, y], (node, side) =>
    isLocalSymbol(symbolAt(node, env.checker), env.units[side]),
  );
  if (locals[0] !== locals[1]) {
    return 'one copy names a local where the other names an outer value';
  }
  return locals[0] ? localStep(env, x, y) : outerStep(env, x, y);
}

function leafStep(env: AlignEnv, x: TypeScript.Node, y: TypeScript.Node): string | undefined {
  const same = x.getText(env.sourceFile) === y.getText(env.sourceFile);
  return same ? undefined : addHole(env, x, y);
}

function step(env: AlignEnv, x: TypeScript.Node, y: TypeScript.Node): string | undefined {
  if (x.kind !== y.kind) {
    return addHole(env, x, y);
  }
  if (ts.isTypeNode(x)) {
    const same = normalizedText(x, env.sourceFile) === normalizedText(y, env.sourceFile);
    return same ? undefined : 'the copies use different types';
  }
  if (ts.isIdentifier(x) && ts.isIdentifier(y)) {
    return identifierStep(env, x, y);
  }
  const [left, right] = [childrenOf(x), childrenOf(y)];
  if (left.length === 0 && right.length === 0) {
    return leafStep(env, x, y);
  }
  if (left.length !== right.length) {
    return SHAPE;
  }
  env.pending.push(...paired(left, right));
  return scalarProblem(x, y);
}

export function alignRegions(pairs: readonly Both<TypeScript.Node>[], shared: SharedEnv): Aligned {
  const env: AlignEnv = {
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
