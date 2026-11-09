import { isSideEffectFree } from '../../../../../../shared/logic/purity.mjs';
import {
  foldTerm,
  isComparison,
  key,
  not,
  term,
  withRange,
} from '../../../../../../shared/logic/terms.mjs';
import { foldTree } from '../../../../../../shared/traversal.mjs';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { partsOf } from '../analysis/narrowing/type-parts.mjs';
import { toTerm } from '../analysis/logic/estree-terms.mjs';
import { inside, isFunction, syntaxChildren } from './syntax.mjs';

const EFFECTS = new Set([
  'AwaitExpression',
  'YieldExpression',
  'NewExpression',
  'ImportExpression',
]);
const RELATIONS = new Set(['<', '<=', '>', '>=']);
const MEMBER_KINDS = new Set(['member', 'index', 'call']);
const NUMBER = ts.TypeFlags.NumberLike;

function rangeKey(range) {
  return `${String(range[0])}:${String(range[1])}`;
}

function isNumberTyped(services, node) {
  const parts = partsOf(services.getTypeAtLocation(node));
  return parts.every((part) => (part.flags & NUMBER) !== 0);
}

function untypedComparisons(node, services) {
  const typed = services?.program !== null && services?.program !== undefined;
  return new Set(
    [...inside(node)]
      .filter((child) => child.type === 'BinaryExpression' && RELATIONS.has(child.operator))
      .filter(
        (child) =>
          !typed || ![child.left, child.right].every((side) => isNumberTyped(services, side)),
      )
      .map((child) => rangeKey(child.range)),
  );
}

/**
 * The condition as a logic term. An order comparison whose operands are not both numbers becomes a
 * named atom, because the solver orders numbers and strings would break transitivity.
 */
export function conditionTerm(node, sourceCode) {
  const untyped = untypedComparisons(node, sourceCode.parserServices);
  return foldTerm(toTerm(node, sourceCode), (current, children) => {
    const rebuilt = { ...current, children };
    if (!isComparison(current) || !untyped.has(rangeKey(current.range ?? [0, 0]))) {
      return rebuilt;
    }
    return withRange(term('name', `#compare ${key(rebuilt)}`), current.range);
  });
}

function namesOf(root) {
  return foldTerm(root, (node, children) => {
    const names = new Set(children.flatMap((set) => [...set]));
    if (node.kind === 'name') {
      names.add(node.value);
    }
    return names;
  });
}

function readsMembers(root) {
  return foldTerm(root, (node, children) => MEMBER_KINDS.has(node.kind) || children.some(Boolean));
}

/** What `conditionNode` tells when it held (`holds`) or failed, and `reason` to name it by. */
export function fact(conditionNode, sourceCode, { holds, reason }) {
  const raw = toTerm(conditionNode, sourceCode);
  const condition = conditionTerm(conditionNode, sourceCode);
  return {
    term: holds ? condition : not(condition),
    names: namesOf(raw),
    readsMembers: readsMembers(raw),
    reason,
  };
}

export function patternNames(pattern) {
  return [...inside(pattern)].filter((node) => node.type === 'Identifier').map((node) => node.name);
}

function isPureCall(node, sourceCode) {
  return node.type === 'CallExpression' && isSideEffectFree(toTerm(node, sourceCode));
}

function written(node) {
  switch (node.type) {
    case 'AssignmentExpression': {
      return { target: node.left };
    }
    case 'UpdateExpression': {
      return { target: node.argument };
    }
    case 'VariableDeclarator': {
      return { target: node.id };
    }
    case 'ForOfStatement':
    case 'ForInStatement': {
      return { target: node.left };
    }
    case 'CatchClause': {
      return node.param === null ? undefined : { target: node.param };
    }
    case 'UnaryExpression': {
      return node.operator === 'delete' ? { target: node.argument } : undefined;
    }
    default: {
      return undefined;
    }
  }
}

function addEffect(effects, node, sourceCode) {
  const write = written(node);
  if (write !== undefined) {
    for (const name of patternNames(write.target)) {
      effects.writes.add(name);
    }
    effects.memberWrite ||= [...inside(write.target)].some(
      ({ type }) => type === 'MemberExpression',
    );
  }
  const isCall = node.type === 'CallExpression' || node.type === 'TaggedTemplateExpression';
  effects.call ||= EFFECTS.has(node.type) || (isCall && !isPureCall(node, sourceCode));
}

const NO_EFFECTS = Object.freeze({ writes: new Set(), memberWrite: false, call: false });

function merged(parts) {
  return {
    writes: new Set(parts.flatMap(({ writes }) => [...writes])),
    memberWrite: parts.some(({ memberWrite }) => memberWrite),
    call: parts.some(({ call }) => call),
  };
}

function effectTree(root, { sourceCode, effects }) {
  return foldTree(root, true, {
    expand(node, isRoot) {
      const isOpaque = effects.has(node) || (isFunction(node) && !isRoot);
      return isOpaque ? [] : syntaxChildren(node).map((child) => [child, false]);
    },
    combine(node, isRoot, below) {
      if (effects.has(node)) {
        return effects.get(node);
      }
      if (isFunction(node) && !isRoot) {
        return NO_EFFECTS;
      }
      const own = merged(below);
      addEffect(own, node, sourceCode);
      effects.set(node, own);
      return own;
    },
  });
}

/**
 * What running `nodes` may change: assigned names, any member write, any call that is not pure.
 * `flow.effects` keeps the answer for every node below, so nested statements are not walked again.
 */
export function effectsOf(nodes, flow) {
  const present = nodes.filter((node) => node !== null && node !== undefined);
  return merged(present.map((root) => effectTree(root, flow)));
}

function survives(known, effects, mutable) {
  if ([...known.names].some((name) => effects.writes.has(name))) {
    return false;
  }
  if ((effects.call || effects.memberWrite) && known.readsMembers) {
    return false;
  }
  return !effects.call || ![...known.names].some((name) => mutable.has(name));
}

export function afterEffects(facts, effects, mutable) {
  return facts.filter((known) => survives(known, effects, mutable));
}

/**
 * Names a call could change: variables written after their declaration, imported live bindings
 * and unresolved globals.
 */
export function mutableNames(sourceCode) {
  const { scopeManager } = sourceCode;
  const reassigned = scopeManager.scopes
    .flatMap((scope) => scope.variables)
    .filter(
      (variable) =>
        variable.defs.some(({ type }) => type === 'ImportBinding') ||
        variable.references.some((reference) => reference.isWrite() && !reference.init),
    )
    .map((variable) => variable.name);
  const unresolved = scopeManager.globalScope.through.map((reference) => reference.identifier.name);
  return new Set([...reassigned, ...unresolved]);
}
