import { isStableModel } from '../../logic/models/models.mts';
import { pureCallKind } from '../../logic/purity.mts';
import { not, term } from '../../logic/terms.mts';
import { escapingNames } from '../../near-duplicates/canonical/effects.mts';
import { logicTerm } from '../../near-duplicates/proof/terms.mts';
import { nodesOf, present } from '../../near-duplicates/tree/nodes.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import { foldTree } from '../../traversal.mts';
import { NO_EFFECTS, afterEffectsWith, mergedEffects } from './effect-merge.mts';
import type { AfterEffects } from './effect-merge.mts';
import { isOpaqueComparison } from './flow/values/opaque.mts';
import type { Term } from '../../logic/typed/term-types.mts';
import type { Memo } from './typed/memo.mts';
import { termView } from './typed/term-view.mts';
import type { Effects, Fact, Flow, FlowNode, FlowScope } from './typed/decided-types.mts';

const NAMES = new Set(['name']);
const MEMBER_KINDS = new Set(['member', 'index', 'call', 'new']);
const WRITES = new Set(['assign', 'update']);
const DECLARES = new Set(['declare', 'foreach']);
const STATEMENT_TARGETS = new Map<
  string,
  (children: readonly FlowNode[]) => readonly (FlowNode | undefined)[]
>([
  ['delete', (children) => children],
  ['catch', (children) => [children[children.length - 2]]],
  ['item', (children) => [children[1]]],
]);
const SUSPENDING = new Set(['await', 'yield', 'yield from']);
const OPAQUE_VALUE = /^[a-z_]+:/iu;
const OPAQUE_KINDS = new Set(['statement', 'expression']);

function nameScope(scope: FlowScope): { get(name: string): Term } {
  return {
    get(name: string): Term {
      const value = term('name', `bound:${name}`);
      return scope.integers.has(name) ? { ...value, integer: true } : value;
    },
  };
}

export function conditionTerm(node: FlowNode, scope: FlowScope): Term | undefined {
  const context = {
    locals: nameScope(scope),
    parameters: new Map(),
    strictEquality: true,
    looseBooleans: scope.looseBooleans,
    exactIntegers: scope.unbounded,
    isOpaque: (candidate: FlowNode) => isOpaqueComparison(candidate, scope),
  };
  return logicTerm(node, context);
}

export function namesOf(node: FlowNode): Set<string> {
  return new Set(
    nodesOf(node)
      .filter(({ kind }) => NAMES.has(kind))
      .flatMap(({ value }) => (value === undefined ? [] : [value])),
  );
}

function readsMembers(node: FlowNode): boolean {
  return nodesOf(node).some(({ kind }) => MEMBER_KINDS.has(kind));
}

export function fact(
  node: FlowNode,
  scope: FlowScope,
  { holds, reason }: { readonly holds: boolean; readonly reason: string },
): Fact | undefined {
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

function isOpaque(node: FlowNode): boolean {
  return (
    OPAQUE_KINDS.has(node.kind) && node.children.length === 0 && OPAQUE_VALUE.test(node.value ?? '')
  );
}

const BOOLEAN_CONVERSIONS = new Set(['bool']);

export function isBooleanConversion(callee: FlowNode): boolean {
  return (
    callee.kind === 'name' &&
    callee.binding === 'free' &&
    callee.value !== undefined &&
    BOOLEAN_CONVERSIONS.has(callee.value)
  );
}

function isEffectCall(node: FlowNode, views: Memo<TreeNode, Term>): boolean {
  if (node.kind === 'new') {
    return true;
  }
  if (node.kind === 'expression') {
    return node.value !== undefined && SUSPENDING.has(node.value);
  }
  return (
    node.kind === 'call' &&
    !isStableModel(termView(node, views)) &&
    !isBooleanConversion(present(node.children[0])) &&
    pureCallKind(termView(present(node.children[0]), views)) === undefined
  );
}

function writtenTargets(node: FlowNode): readonly (FlowNode | undefined)[] {
  if (WRITES.has(node.kind)) {
    return [node.children[0]];
  }
  if (DECLARES.has(node.kind)) {
    return [node.children[1]];
  }
  return node.kind === 'statement' && node.value !== undefined
    ? (STATEMENT_TARGETS.get(node.value)?.(node.children) ?? [])
    : [];
}

function isNode(node: FlowNode | undefined): node is FlowNode {
  return node !== undefined;
}

export function writtenNames(node: FlowNode): string[] {
  return writtenTargets(node)
    .filter(isNode)
    .flatMap((target) => [...namesOf(target)]);
}

function ownEffects(
  node: FlowNode,
  below: readonly Effects[],
  views: Memo<TreeNode, Term>,
): Effects {
  const own = mergedEffects(below);
  for (const target of writtenTargets(node).filter(isNode)) {
    for (const name of namesOf(target)) {
      own.writes.add(name);
    }
    own.memberWrite ||= readsMembers(target);
  }
  own.call ||= isEffectCall(node, views);
  own.opaque ||= isOpaque(node);
  return own;
}

function effectTree(root: FlowNode, { effects, views }: Flow): Effects {
  return foldTree(root, true, {
    expand(node: FlowNode, isRoot: boolean) {
      const isOpaque = effects.has(node) || (node.kind === 'lambda' && !isRoot);
      return isOpaque ? [] : node.children.map((child) => [child, false]);
    },
    combine(node: FlowNode, isRoot: boolean, below: readonly Effects[]) {
      const known = effects.get(node);
      if (known !== undefined) {
        return known;
      }
      if (node.kind === 'lambda' && !isRoot) {
        return NO_EFFECTS;
      }
      const own = ownEffects(node, below, views);
      effects.remember(node, own);
      return own;
    },
  });
}

export function effectsOf(nodes: readonly (FlowNode | undefined)[], flow: Flow): Effects {
  const kept = nodes.filter((node): node is FlowNode => node !== undefined && node.kind !== 'none');
  return mergedEffects(kept.map((root) => effectTree(root, flow)));
}

export const afterEffects: AfterEffects = afterEffectsWith(true);

export function mutableNames(tree: FlowNode): Set<string> {
  const free = nodesOf(tree)
    .filter((node) => node.kind === 'name' && node.binding !== 'bound')
    .flatMap(({ value }) => (value === undefined ? [] : [value]));
  return new Set([...free, ...escapingNames(tree)]);
}
