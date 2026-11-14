import { pureCallKind } from '../../logic/purity.mjs';
import { not, term } from '../../logic/terms.mjs';
import { escapingNames } from '../../near-duplicates/canonical/effects.mjs';
import { logicTerm } from '../../near-duplicates/proof/terms.mjs';
import { nodesOf } from '../../near-duplicates/tree/nodes.mjs';
import { foldTree } from '../../traversal.mjs';

const NAMES = new Set(['name']);
const MEMBER_KINDS = new Set(['member', 'index', 'call', 'new']);
const WRITES = new Set(['assign', 'update']);
const DECLARES = new Set(['declare', 'foreach']);
const STATEMENT_TARGETS = {
  delete: (children) => children,
  catch: (children) => [children[children.length - 2]],
  item: (children) => [children[1]],
};
const SUSPENDING = new Set(['await', 'yield', 'yield from']);
const OPAQUE_VALUE = /^[a-z_]+:/iu;
const OPAQUE_KINDS = new Set(['statement', 'expression']);

function nameScope(scope) {
  return {
    get(name) {
      const value = term('name', `bound:${name}`);
      return scope.integers.has(name) ? { ...value, integer: true } : value;
    },
  };
}

/**
 * The condition as a logic term. Arithmetic is a named value (`logicTerm`): JVM integers overflow
 * and floats round, so the solver may not do sums for them.
 */
export function conditionTerm(node, scope) {
  const context = {
    locals: nameScope(scope),
    parameters: new Map(),
    strictEquality: true,
    looseBooleans: scope.looseBooleans,
  };
  return logicTerm(node, context);
}

export function namesOf(node) {
  return new Set(
    nodesOf(node)
      .filter(({ kind }) => NAMES.has(kind))
      .map(({ value }) => value),
  );
}

function readsMembers(node) {
  return nodesOf(node).some(({ kind }) => MEMBER_KINDS.has(kind));
}

/** What `node` tells when it held (`holds`) or failed, and `reason` to name it by. */
export function fact(node, scope, { holds, reason }) {
  const condition = conditionTerm(node, scope);
  return condition === undefined
    ? undefined
    : {
        term: holds ? condition : not(condition),
        names: namesOf(node),
        readsMembers: readsMembers(node),
        reason,
      };
}

const NO_EFFECTS = Object.freeze({
  writes: new Set(),
  memberWrite: false,
  call: false,
  opaque: false,
});

function merged(parts) {
  return {
    writes: new Set(parts.flatMap(({ writes }) => [...writes])),
    memberWrite: parts.some(({ memberWrite }) => memberWrite),
    call: parts.some(({ call }) => call),
    opaque: parts.some(({ opaque }) => opaque),
  };
}

function isOpaque(node) {
  return OPAQUE_KINDS.has(node.kind) && node.children.length === 0 && OPAQUE_VALUE.test(node.value);
}

function isEffectCall(node) {
  if (node.kind === 'new') {
    return true;
  }
  if (node.kind === 'expression') {
    return SUSPENDING.has(node.value);
  }
  return node.kind === 'call' && pureCallKind(node.children[0]) === undefined;
}

function writtenTargets(node) {
  if (WRITES.has(node.kind)) {
    return [node.children[0]];
  }
  if (DECLARES.has(node.kind)) {
    return [node.children[1]];
  }
  return node.kind === 'statement' ? (STATEMENT_TARGETS[node.value]?.(node.children) ?? []) : [];
}

function ownEffects(node, below) {
  const own = merged(below);
  for (const target of writtenTargets(node).filter(Boolean)) {
    for (const name of namesOf(target)) {
      own.writes.add(name);
    }
    own.memberWrite ||= readsMembers(target);
  }
  own.call ||= isEffectCall(node);
  own.opaque ||= isOpaque(node);
  return own;
}

function effectTree(root, effects) {
  return foldTree(root, true, {
    expand(node, isRoot) {
      const isOpaque = effects.has(node) || (node.kind === 'lambda' && !isRoot);
      return isOpaque ? [] : node.children.map((child) => [child, false]);
    },
    combine(node, isRoot, below) {
      if (effects.has(node)) {
        return effects.get(node);
      }
      if (node.kind === 'lambda' && !isRoot) {
        return NO_EFFECTS;
      }
      const own = ownEffects(node, below);
      effects.set(node, own);
      return own;
    },
  });
}

/**
 * What running `nodes` may change: written names, any member write, any call that is not pure,
 * and any statement the tree keeps as opaque text.
 */
export function effectsOf(nodes, flow) {
  const present = nodes.filter((node) => node !== undefined && node.kind !== 'none');
  return merged(present.map((root) => effectTree(root, flow.effects)));
}

function survives(known, effects, mutable) {
  if (effects.opaque || [...known.names].some((name) => effects.writes.has(name))) {
    return false;
  }
  const reaches = effects.call || effects.memberWrite;
  if (reaches && known.readsMembers) {
    return false;
  }
  return !(reaches && [...known.names].some((name) => mutable.has(name)));
}

export function afterEffects(facts, effects, mutable) {
  return facts.filter((known) => survives(known, effects, mutable));
}

/** Names a call could change: names the unit does not bind, and names a lambda in it uses. */
export function mutableNames(tree) {
  const free = nodesOf(tree)
    .filter((node) => node.kind === 'name' && node.binding !== 'bound')
    .map(({ value }) => value);
  return new Set([...free, ...escapingNames(tree)]);
}
