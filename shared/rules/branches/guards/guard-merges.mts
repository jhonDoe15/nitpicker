import { ifHead, joined, negated } from './condition-text.mts';
import { hasNoSideEffects } from './side-effects.mts';
import { testsType } from './type-tests.mts';
import { branchKey } from '../arm-keys.mts';
import { digest } from '../../../near-duplicates/tree/keys.mts';
import { isJump, nodesOf, present, sizeOf } from '../../../near-duplicates/tree/nodes.mts';
import type { TreeNode } from '../../../near-duplicates/tree/tree-types.mts';
import { listNames } from '../../../messages/messages.mts';
import type { BranchFinding } from '../arm-types.mts';

type Guard = { readonly node: TreeNode; readonly key: string };

type NestedPlan = { readonly shared: string; readonly mirrored: boolean };

const MIN_BLOCK_NODES = 3;
const SHORT_KEY = 12;

function hasElse(node: TreeNode): boolean {
  return node.children[2] !== undefined && node.children[2].kind !== 'none';
}

function isGuard(node: TreeNode): boolean {
  const [condition, body] = node.children;
  return (
    node.kind === 'if' &&
    !hasElse(node) &&
    condition !== undefined &&
    body?.kind === 'block' &&
    body.children.length > 0 &&
    isJump(body.children.at(-1)) &&
    !testsType({ condition }) &&
    condition.text !== undefined
  );
}

function guardOf(node: TreeNode): Guard {
  return { node, key: branchKey(present(node.children[1])) };
}

function extendsRun(run: readonly Guard[], guard: Guard): boolean {
  return run.at(-1)?.key === guard.key && hasNoSideEffects(present(guard.node.children[0]));
}

function runsOf(statements: readonly TreeNode[]): Guard[][] {
  const runs: Guard[][] = [];
  for (const statement of statements) {
    const guard = isGuard(statement) ? guardOf(statement) : undefined;
    const run = runs.at(-1);
    if (guard === undefined) {
      runs.push([]);
    } else if (run !== undefined && run.length > 0 && extendsRun(run, guard)) {
      run.push(guard);
    } else {
      runs.push([guard]);
    }
  }
  return runs.filter((run) => run.length > 1);
}

function guardName({ node }: Guard): string {
  return `\`${present(node.children[0]).text ?? ''}\` (line ${String(node.start)})`;
}

function guardFinding(run: readonly Guard[], file: string): BranchFinding {
  const conditions = run.map(({ node }) => present(node.children[0]));
  const first = present(run[0]);
  return {
    identity: `guards:${digest(first.key).slice(0, SHORT_KEY)}`,
    line: first.node.start,
    values: {
      subject: `The guards ${listNames(run.map(guardName))} have the same body`,
      fix: `Merge them into one guard: \`${ifHead(joined(conditions, 'or', file), file)}\`.`,
    },
  };
}

function innerOf(node: TreeNode): TreeNode | undefined {
  const [, then, otherwise] = node.children;
  const only = then?.kind === 'block' && then.children.length === 1 ? then.children[0] : undefined;
  const nested = only?.kind === 'if' && hasElse(only) && only.children[2]?.kind === 'block';
  return hasElse(node) && otherwise?.kind === 'block' && nested ? only : undefined;
}

function nestedPlan(outer: TreeNode, inner: TreeNode): NestedPlan | undefined {
  const shared = branchKey(present(outer.children[2]));
  const [, thenArm, elseArm] = inner.children;
  const sameElse = branchKey(present(elseArm)) === shared;
  const sameThen = branchKey(present(thenArm)) === shared;
  if (sameElse === sameThen || sizeOf(present(outer.children[2])) < MIN_BLOCK_NODES) {
    return undefined;
  }
  return { shared, mirrored: sameThen };
}

function nestedFinding(
  { outer, inner }: { readonly outer: TreeNode; readonly inner: TreeNode },
  plan: NestedPlan,
  file: string,
): BranchFinding {
  const outerTest = present(outer.children[0]);
  const innerTest = present(inner.children[0]);
  const second = plan.mirrored ? negated(innerTest, file) : undefined;
  const text = joined([outerTest, innerTest], 'and', file);
  const merged =
    second === undefined
      ? text
      : `${joined([outerTest], 'and', file)} ${file.endsWith('.py') ? 'and' : '&&'} ${second}`;
  return {
    identity: `nested:${digest(plan.shared).slice(0, SHORT_KEY)}`,
    line: outer.start,
    values: {
      subject: `The \`else\` on line ${String(present(outer.children[2]).start)} repeats the inner \`else\` of the \`if\` on line ${String(inner.start)}`,
      fix: `Use one test, \`${ifHead(merged, file)}\`, for the inner branch, and keep a single \`else\`.`,
    },
  };
}

function nestedFindings(node: TreeNode, file: string): BranchFinding[] {
  const inner = node.kind === 'if' ? innerOf(node) : undefined;
  const conditions =
    inner === undefined ? [] : [present(node.children[0]), present(inner.children[0])];
  if (
    inner === undefined ||
    conditions.some((c) => c.text === undefined || testsType({ condition: c }))
  ) {
    return [];
  }
  const plan = nestedPlan(node, inner);
  return plan === undefined ? [] : [nestedFinding({ outer: node, inner }, plan, file)];
}

export function guardSimplifications(tree: TreeNode, file: string): BranchFinding[] {
  const nodes = nodesOf(tree);
  const blocks = nodes.filter((node) => node.kind === 'block');
  return [
    ...blocks.flatMap((block) => runsOf(block.children).map((run) => guardFinding(run, file))),
    ...nodes.flatMap((node) => nestedFindings(node, file)),
  ];
}
