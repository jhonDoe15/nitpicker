import { solverBudget } from '../../logic/sync/budget.mts';
import { findShorter } from '../../logic/shorter/find-shorter.mts';
import { C_STYLE, PYTHON_STYLE, renderSkeleton } from '../../logic/shorter/render.mts';
import { skeletonOf, leavesOf } from '../../logic/shorter/skeleton.mts';
import { nodesOf } from '../../near-duplicates/tree/nodes.mts';
import { integerNames } from '../decided/slips/declared-names.mts';
import { declaredTypes } from '../decided/models/types.mts';
import { conditionTerm } from '../decided/facts.mts';
import type { FlowScope } from '../decided/typed/decided-types.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import type { Skeleton, Style } from '../../logic/typed/skeleton-types.mts';
import type { SolverBudget } from '../../logic/typed/solver-types.mts';
import type { Term } from '../../logic/typed/term-types.mts';
import { isUnboxingGuard } from './unboxing.mts';

const CONNECTIVES = new Set<string | undefined>(['&&', '||']);
const TESTED = new Set(['if', 'while', 'conditional']);
const SNIPPET_LIMIT = 60;
const CUT = '...';
const NO_TEXT = '\u0000no-text';

type ConditionScope = { isPython: boolean; kotlin: boolean; references: boolean };
type Site = { node: TreeNode; condition: string; form: string; reason: string };
type Context = {
  style: Style;
  solver: SolverBudget;
  isPython: boolean;
  tests: ReadonlySet<TreeNode | undefined>;
  isPinned: typeof isUnboxingGuard | undefined;
};

function isConnective(node: TreeNode): boolean {
  return (
    (node.kind === 'binary' && CONNECTIVES.has(node.value)) ||
    (node.kind === 'unary' && node.value === '!')
  );
}

function isCut(text: string): boolean {
  return text.length >= SNIPPET_LIMIT && text.endsWith(CUT);
}

function sourceText(_term: Term, node: TreeNode | undefined): string {
  const text = node?.text ?? (node?.kind === 'name' ? node.value : undefined);
  return text === undefined || isCut(text) ? NO_TEXT : text;
}

const SOURCE = {
  children: (node: TreeNode | undefined, index: number) => node?.children[index],
  text: sourceText,
};

function textOf(root: TreeNode, skeleton: Skeleton, style: Style): string {
  return root.text !== undefined && !isCut(root.text) ? root.text : renderSkeleton(skeleton, style);
}

function scopeOf(tree: TreeNode, { isPython, kotlin, references }: ConditionScope): FlowScope {
  return {
    integers: integerNames(tree),
    looseBooleans: isPython,
    unbounded: false,
    kotlin,
    references,
    shadowed: new Set<string>(),
    go: false,
    remainders: false,
    types: declaredTypes(tree),
    enums: new Set<string>(),
  };
}

function shorterSite(root: TreeNode, scope: FlowScope, context: Context): Site[] {
  const term = conditionTerm(root, scope);
  const skeleton =
    term === undefined ? undefined : skeletonOf(term, { rootContext: root, ...SOURCE });
  if (skeleton === undefined || leavesOf(skeleton).some(({ text }) => text === NO_TEXT)) {
    return [];
  }
  const { style, solver, isPython, tests, isPinned } = context;
  const shorter = findShorter(skeleton, {
    style,
    solver,
    booleanContext: !isPython || tests.has(root),
    ...(isPinned === undefined ? {} : { isPinned }),
  });
  return shorter === undefined
    ? []
    : [
        {
          node: root,
          condition: textOf(root, skeleton, style),
          form: shorter.form,
          reason: shorter.reasons.join('; '),
        },
      ];
}

export function shorterConditions(
  tree: TreeNode,
  { isPython, kotlin, references }: ConditionScope,
): Site[] {
  const all = nodesOf(tree);
  const inner = new Set(all.filter(isConnective).flatMap((node) => node.children));
  const tests = new Set(
    all.filter((node) => TESTED.has(node.kind)).map((node) => node.children[0]),
  );
  const scope = scopeOf(tree, { isPython, kotlin, references });
  const context = {
    style: isPython ? PYTHON_STYLE : C_STYLE,
    solver: solverBudget(),
    isPython,
    tests,
    isPinned: references && !kotlin ? isUnboxingGuard : undefined,
  };
  return all
    .filter((node) => isConnective(node) && !inner.has(node))
    .flatMap((root) => shorterSite(root, scope, context));
}
