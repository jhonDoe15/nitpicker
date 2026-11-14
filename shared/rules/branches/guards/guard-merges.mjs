import { ifHead, joined, negated } from './condition-text.mjs';
import { hasNoSideEffects } from './side-effects.mjs';
import { testsType } from './type-tests.mjs';
import { branchKey } from '../arm-keys.mjs';
import { digest } from '../../../near-duplicates/tree/keys.mjs';
import { isJump, nodesOf, sizeOf } from '../../../near-duplicates/tree/nodes.mjs';
import { listNames } from '../../../messages/messages.mjs';

const MIN_BLOCK_NODES = 3;
const SHORT_KEY = 12;

function hasElse(node) {
  return node.children[2] !== undefined && node.children[2].kind !== 'none';
}

function isGuard(node) {
  const [condition, body] = node.children;
  return (
    node.kind === 'if' &&
    !hasElse(node) &&
    body.kind === 'block' &&
    body.children.length > 0 &&
    isJump(body.children.at(-1)) &&
    !testsType({ condition }) &&
    condition.text !== undefined
  );
}

function guardOf(node) {
  return { node, key: branchKey(node.children[1]) };
}

function extendsRun(run, guard) {
  return run.at(-1).key === guard.key && hasNoSideEffects(guard.node.children[0]);
}

function runsOf(statements) {
  const runs = [];
  for (const statement of statements) {
    const guard = isGuard(statement) ? guardOf(statement) : undefined;
    const run = runs.at(-1);
    if (guard === undefined) {
      runs.push([]);
    } else if (run?.length > 0 && extendsRun(run, guard)) {
      run.push(guard);
    } else {
      runs.push([guard]);
    }
  }
  return runs.filter((run) => run.length > 1);
}

function guardName({ node }) {
  return `\`${node.children[0].text}\` (line ${String(node.start)})`;
}

function guardFinding(run, file) {
  const conditions = run.map(({ node }) => node.children[0]);
  return {
    identity: `guards:${digest(run[0].key).slice(0, SHORT_KEY)}`,
    line: run[0].node.start,
    values: {
      subject: `The guards ${listNames(run.map(guardName))} have the same body`,
      fix: `Merge them into one guard: \`${ifHead(joined(conditions, 'or', file), file)}\`.`,
    },
  };
}

function innerOf(node) {
  const [, then, otherwise] = node.children;
  const only = then.kind === 'block' && then.children.length === 1 ? then.children[0] : undefined;
  const nested = only?.kind === 'if' && hasElse(only) && only.children[2].kind === 'block';
  return hasElse(node) && otherwise.kind === 'block' && nested ? only : undefined;
}

function nestedPlan(outer, inner) {
  const shared = branchKey(outer.children[2]);
  const [, thenArm, elseArm] = inner.children;
  const sameElse = branchKey(elseArm) === shared;
  const sameThen = branchKey(thenArm) === shared;
  if (sameElse === sameThen || sizeOf(outer.children[2]) < MIN_BLOCK_NODES) {
    return undefined;
  }
  return { shared, mirrored: sameThen };
}

function nestedFinding({ outer, inner }, plan, file) {
  const [outerTest] = outer.children;
  const [innerTest] = inner.children;
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
      subject: `The \`else\` on line ${String(outer.children[2].start)} repeats the inner \`else\` of the \`if\` on line ${String(inner.start)}`,
      fix: `Use one test, \`${ifHead(merged, file)}\`, for the inner branch, and keep a single \`else\`.`,
    },
  };
}

function nestedFindings(node, file) {
  const inner = node.kind === 'if' ? innerOf(node) : undefined;
  const conditions = inner === undefined ? [] : [node.children[0], inner.children[0]];
  if (
    inner === undefined ||
    conditions.some((c) => c.text === undefined || testsType({ condition: c }))
  ) {
    return [];
  }
  const plan = nestedPlan(node, inner);
  return plan === undefined ? [] : [nestedFinding({ outer: node, inner }, plan, file)];
}

/**
 * Report-only simplifications over statements: adjacent guards without `else` that end in a jump
 * and share one body (merge into `a || b`), and an `if` whose inner `if`/`else` repeats the
 * outer `else` (`a && b`). Each is `{ identity, line, values }`.
 */
export function guardSimplifications(tree, file) {
  const nodes = nodesOf(tree);
  const blocks = nodes.filter((node) => node.kind === 'block');
  return [
    ...blocks.flatMap((block) => runsOf(block.children).map((run) => guardFinding(run, file))),
    ...nodes.flatMap((node) => nestedFindings(node, file)),
  ];
}
