import { solverBudget } from '../../logic/sync/budget.mjs';
import { findShorter } from '../../logic/shorter/find-shorter.mjs';
import { C_STYLE, PYTHON_STYLE, renderSkeleton } from '../../logic/shorter/render.mjs';
import { skeletonOf, leavesOf } from '../../logic/shorter/skeleton.mjs';
import { nodesOf } from '../../near-duplicates/tree/nodes.mjs';
import { integerNames } from '../decided/decided.mjs';
import { declaredTypes } from '../decided/models/types.mjs';
import { conditionTerm } from '../decided/facts.mjs';
import { isUnboxingGuard } from './unboxing.mjs';

const CONNECTIVES = new Set(['&&', '||']);
const TESTED = new Set(['if', 'while', 'conditional']);
const SNIPPET_LIMIT = 60;
const CUT = '...';

function isConnective(node) {
  return (
    (node.kind === 'binary' && CONNECTIVES.has(node.value)) ||
    (node.kind === 'unary' && node.value === '!')
  );
}

function isCut(text) {
  return text.length >= SNIPPET_LIMIT && text.endsWith(CUT);
}

function sourceText(_term, node) {
  const text = node?.text ?? (node?.kind === 'name' ? node.value : undefined);
  return text === undefined || isCut(text) ? undefined : text;
}

const SOURCE = {
  children: (node, index) => node?.children[index],
  text: sourceText,
};

function textOf(root, skeleton, style) {
  return root.text !== undefined && !isCut(root.text) ? root.text : renderSkeleton(skeleton, style);
}

function scopeOf(tree, { isPython, kotlin, references }) {
  return {
    integers: integerNames(tree),
    looseBooleans: isPython,
    kotlin,
    references,
    types: declaredTypes(tree),
  };
}

function shorterSite(root, scope, context) {
  const term = conditionTerm(root, scope);
  const skeleton =
    term === undefined ? undefined : skeletonOf(term, { rootContext: root, ...SOURCE });
  if (skeleton === undefined || leavesOf(skeleton).some(({ text }) => text === undefined)) {
    return [];
  }
  const { style, solver, isPython, tests, isPinned } = context;
  const shorter = findShorter(skeleton, {
    style,
    solver,
    booleanContext: !isPython || tests.has(root),
    isPinned,
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

/**
 * The `&&`/`||`/`!` conditions of one function unit that have an equivalent form with fewer operands:
 * `{ node, condition, form, reason }`, each from the maximal condition that holds the chain. `isPython`
 * (where `and`/`or` return an operand) takes a non-boolean operand only as the test of an `if`,
 * `while` or conditional expression.
 */
export function shorterConditions(tree, { isPython, kotlin = false, references = false }) {
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
