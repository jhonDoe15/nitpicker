import type { Node } from 'web-tree-sitter';
import type { AlignState, Attempt, Occurrence, Pair, ValueHole } from '../../../extract-types.mts';
import { bindPair } from '../../../jvm-views.mts';
import {
  ancestorsWithin,
  childrenStep,
  codeParts,
  parentOf,
  present,
  SHAPE,
  squashed,
} from '../../syntax.mts';
import { isTypeNode, literalTypeOf, modifierWords, roleOf, type Role } from '../syntax.mts';

type Names = readonly [ReadonlySet<string>, ReadonlySet<string>];
export type KotlinAlignContext = {
  readonly locals: Names;
  readonly inside?: Names | undefined;
  readonly units: Pair;
  readonly prebound: readonly (readonly [string, string])[];
};
export type KotlinAligned = {
  readonly holes: ValueHole[];
  readonly bindings: [string, string][];
};
type State = AlignState;

const NOT_PLAIN = 'the copies differ in code that is not a plain value';
const BINDING_ROLES: Readonly<Record<Role, boolean>> = {
  reference: true,
  callee: false,
  member: false,
  declaration: true,
  other: false,
};
const NUMERIC = new Set(['Int', 'Long', 'Double', 'Float']);

function constantProblem(node: Node, unit: Node): boolean {
  return ancestorsWithin(node, unit).some(
    (ancestor) =>
      ancestor.type === 'annotation' ||
      ancestor.type === 'function_value_parameters' ||
      (ancestor.type === 'when_entry' &&
        ancestor
          .childrenForFieldName('condition')
          .some(
            (condition) =>
              node.startIndex >= condition.startIndex && node.endIndex <= condition.endIndex,
          )) ||
      (ancestor.type === 'property_declaration' && modifierWords(ancestor).includes('const')),
  );
}

function declaredType(node: Node, literal: string): string | undefined {
  const declaration = parentOf(node);
  if (declaration.type !== 'property_declaration') {
    return undefined;
  }
  const variable = codeParts(declaration).find(({ type }) => type === 'variable_declaration');
  const type = variable === undefined ? undefined : codeParts(variable).find(isTypeNode);
  return type === undefined || squashed(type) === literal ? literal : undefined;
}

function holeType(node: Node, unit: Node): string | undefined {
  const literal = literalTypeOf(node);
  if (literal === undefined || constantProblem(node, unit)) {
    return undefined;
  }
  const declared = declaredType(node, literal);
  return NUMERIC.has(literal) || parentOf(node).type === 'property_declaration'
    ? declared
    : literal;
}

function addHole(state: State, context: KotlinAlignContext, pair: Pair): string | undefined {
  const types = pair.map((node, side) => holeType(node, present(context.units[side])));
  const [first, second] = types;
  if (first === undefined || second === undefined) {
    return NOT_PLAIN;
  }
  if (first !== second || literalTypeOf(pair[0]) !== literalTypeOf(pair[1])) {
    return 'the differing values have different types';
  }
  const texts = pair.map((node) => node.text);
  const key = [...texts, first].join('\u0000');
  const known = state.holes.get(key);
  const fresh: ValueHole = {
    key,
    pairKey: texts.join('\u0000'),
    type: first,
    kind: 'direct',
    occurrences: [],
  };
  const hole = known === undefined || known.kind === 'type' ? fresh : known;
  const occurrence: Occurrence = { a: pair[0], b: pair[1] };
  hole.occurrences.push(occurrence);
  state.holes.set(key, hole);
  return undefined;
}

function nameStep([x, y]: Pair, context: KotlinAlignContext, state: State): string | undefined {
  const [roleX, roleY] = [roleOf(x), roleOf(y)];
  const bound = [context.locals[0].has(x.text), context.locals[1].has(y.text)];
  const bindsAsLocal = roleX === 'callee' && bound[0];
  if (roleX !== roleY) {
    return SHAPE;
  }
  if (!(bindsAsLocal || BINDING_ROLES[roleX])) {
    return x.text === y.text ? undefined : 'the copies call or read differently named members';
  }
  if (bound[0] !== bound[1]) {
    return 'one copy names a local where the other names an outer value';
  }
  if (!bound[0]) {
    return x.text === y.text ? undefined : 'the copies read differently named outer values';
  }
  const { inside } = context;
  if (inside !== undefined && inside[0].has(x.text) !== inside[1].has(y.text)) {
    return 'a name is defined inside the run in only one copy';
  }
  return bindPair(state, x.text, y.text) ? undefined : 'the copies rename a local inconsistently';
}

function isLiteralNode(node: Node): boolean {
  return literalTypeOf(node) !== undefined;
}

function sameLiteral(pair: Pair, context: KotlinAlignContext, state: State): string | undefined {
  const [x, y] = pair;
  return x.text === y.text ? undefined : addHole(state, context, pair);
}

function step(pair: Pair, context: KotlinAlignContext, state: State): string | undefined {
  const [x, y] = pair;
  const literals = [isLiteralNode(x), isLiteralNode(y)];
  if (literals[0] && literals[1]) {
    return sameLiteral(pair, context, state);
  }
  if (literals[0] || literals[1]) {
    return NOT_PLAIN;
  }
  if (x.type !== y.type) {
    return NOT_PLAIN;
  }
  if (x.type === 'identifier') {
    return nameStep(pair, context, state);
  }
  if (isTypeNode(x)) {
    return squashed(x) === squashed(y) ? undefined : 'the copies use different types';
  }
  return childrenStep(pair, state);
}

export function alignKotlin(
  pairs: readonly Pair[],
  context: KotlinAlignContext,
): Attempt<KotlinAligned> {
  const state: State = {
    forward: new Map(),
    backward: new Map(),
    holes: new Map(),
    typeSites: new Set(),
    pending: [...pairs],
  };
  for (const [left, right] of context.prebound) {
    if (!bindPair(state, left, right)) {
      return { declined: 'the copies rename a parameter inconsistently' };
    }
  }
  for (const pair of state.pending) {
    const problem = step(pair, context, state);
    if (problem !== undefined) {
      return { declined: problem };
    }
  }
  const holes = [...state.holes.values()].filter((hole): hole is ValueHole => hole.kind !== 'type');
  return { holes, bindings: [...state.forward] };
}
