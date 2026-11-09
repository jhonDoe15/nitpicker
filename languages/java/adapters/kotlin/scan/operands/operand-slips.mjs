import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { comparisonVerdict, constantComparison } from './constant-comparisons.mjs';
import {
  expressionForest,
  isEffectFree,
  isStable,
  nodeKey,
  expressionNodes,
  nodeText,
  unwrapped,
} from './operand-terms.mjs';

const RULE = 'OperandSlip';
const SELF_OPERATORS = new Set(['<', '<=', '>', '>=', '-', '/', '%', 'and', 'or', 'xor']);
const EQUALITIES = new Set(['==', '!=', '===', '!==']);
const ERASING = new Set(['*', 'and']);
const ZEROS = new Set(['0', '0L']);
const CHAINS = new Set(['&&', '||']);
const COMMUTATIVE = new Set(['+', '*']);
const PLAIN = /^[\w.?!`]+$/;
const NAN_NAME = /^[\w.`]+$/;
const FIX_COPY = 'One side was probably copied: fix the operand that was meant to differ.';

const MESSAGES = {
  [RULE]:
    'An operand looks copied by mistake: the same value on both sides of an operator or twice in one `&&`/`||` chain, comparisons of one value that contradict or repeat each other, `x * 0`, or `a += a + b`. The finding names the slip.',
};

function report(forest, node, message) {
  const offset = forest.tokens[node.first].start;
  return { rule: RULE, offset, subject: `${message}\0${nodeText(forest, node)}`, message };
}

function sameOperandMessage(forest, node) {
  const checked = SELF_OPERATORS.has(node.operator) || EQUALITIES.has(node.operator);
  if (
    !checked ||
    !isStable(forest, node.left) ||
    nodeKey(forest, node.left) !== nodeKey(forest, node.right)
  ) {
    return undefined;
  }
  const operand = nodeText(forest, node.left);
  if ((node.operator === '==' || node.operator === '!=') && NAN_NAME.test(operand)) {
    return `\`${operand}\` is compared with itself. To test for NaN, write \`${operand}.isNaN()\`. ${FIX_COPY}`;
  }
  return `\`${operand}\` is on both sides of \`${node.operator}\`. ${FIX_COPY}`;
}

function isZero(forest, node) {
  const inner = unwrapped(forest, node);
  return (
    inner.operator === undefined &&
    inner.items.length === 1 &&
    ZEROS.has(forest.tokens[inner.items[0].token].text)
  );
}

function isConstant(forest, node) {
  const inner = unwrapped(forest, node);
  const kinds =
    inner.operator === undefined ? inner.items.map((item) => forest.tokens[item.token].kind) : [];
  return kinds.at(-1) === 'number' && inner.items.at(-1).close === undefined;
}

function erasingMessage(forest, node) {
  if (!ERASING.has(node.operator)) {
    return undefined;
  }
  const kept = [node.left, node.right].find((side) => !isZero(forest, side));
  const erases = isZero(forest, node.left) || isZero(forest, node.right);
  if (!erases || kept === undefined || isConstant(forest, kept) || !isEffectFree(forest, kept)) {
    return undefined;
  }
  const text = nodeText(forest, kept);
  const operand = PLAIN.test(text) ? text : `(${text})`;
  return `\`${node.operator} 0\` erases \`${operand}\`: the result is 0 whatever it holds (or -0.0 or NaN for a \`Double\`). Write the value meant, or fix the operand.`;
}

function operatorFindings(forest, root, sources) {
  return [...expressionNodes(root)]
    .filter((node) => node.operator !== undefined)
    .flatMap((node) => {
      const message =
        sources === 'main'
          ? (sameOperandMessage(forest, node) ?? erasingMessage(forest, node))
          : undefined;
      return message === undefined ? [] : [report(forest, node, message)];
    });
}

function chainOperands(forest, chain) {
  return [
    ...depthFirst(chain, (node) => {
      const inner = unwrapped(forest, node);
      return inner.operator === chain.operator ? [inner.left, inner.right] : [];
    }),
  ].filter((node) => unwrapped(forest, node).operator !== chain.operator);
}

function segments(forest, operands) {
  const runs = [[]];
  for (const operand of operands) {
    runs.at(-1).push(operand);
    if (!isEffectFree(forest, operand)) {
      runs.push([]);
    }
  }
  return runs;
}

function repeatedMessages(forest, operator, run) {
  const seen = new Set();
  return run
    .filter((operand) => isStable(forest, operand))
    .flatMap((operand) => {
      const key = nodeKey(forest, operand);
      const isRepeat = seen.has(key);
      seen.add(key);
      const text = nodeText(forest, operand);
      return isRepeat
        ? [`\`${text}\` appears twice in this \`${operator}\` chain. ${FIX_COPY}`]
        : [];
    });
}

function verdictMessage({ verdict, redundant, deciding }) {
  const messages = {
    impossible:
      'These comparisons of one value cannot both hold, so this `&&` is always false. Fix the constant or operator that was copied.',
    always:
      'Together these comparisons of one value always hold, so this `||` is always true. Fix the constant or operator that was copied.',
    implied: `\`${redundant?.text}\` already follows from \`${deciding?.text}\`, so it checks nothing. Remove it, or fix its constant or operator.`,
    covered: `\`${redundant?.text}\` adds nothing: \`${deciding?.text}\` holds whenever it does. Remove it, or fix its constant or operator.`,
  };
  return messages[verdict];
}

function comparisonMessages(forest, operator, run) {
  const comparisons = run
    .map((operand) => constantComparison(forest, operand))
    .filter((comparison) => comparison !== undefined);
  return comparisons.flatMap((first, index) =>
    comparisons
      .slice(index + 1)
      .filter((second) => second.key !== first.key)
      .map((second) => comparisonVerdict(operator, first, second))
      .filter((verdict) => verdict !== undefined)
      .map((verdict) => verdictMessage(verdict)),
  );
}

function isChainHead(node) {
  return CHAINS.has(node.operator) && node.parent?.operator !== node.operator;
}

function chainFindings(forest, root) {
  return [...expressionNodes(root)]
    .filter((node) => isChainHead(node))
    .flatMap((chain) => {
      const runs = segments(forest, chainOperands(forest, chain));
      const messages = runs.flatMap((run) => [
        ...repeatedMessages(forest, chain.operator, run),
        ...comparisonMessages(forest, chain.operator, run),
      ]);
      return [...new Set(messages)].map((message) => report(forest, chain, message));
    });
}

function compoundOperands(forest, value, operator) {
  const root = unwrapped(forest, value);
  if (root.operator !== operator) {
    return [];
  }
  const spine = [
    ...depthFirst(root, (node) => {
      const inner = unwrapped(forest, node);
      return inner.operator === operator ? [inner.left] : [];
    }),
  ].map((node) => unwrapped(forest, node));
  const leftmost = spine.at(-1);
  if (!COMMUTATIVE.has(operator)) {
    return [leftmost];
  }
  return [
    leftmost,
    ...spine.filter((node) => node.operator === operator).map((node) => node.right),
  ];
}

function compoundFindings(forest) {
  return forest.compounds.flatMap(({ operator, target, value }) => {
    if (!isStable(forest, target)) {
      return [];
    }
    const targetKey = nodeKey(forest, target);
    const repeats = compoundOperands(forest, value, operator).some(
      (side) => nodeKey(forest, side) === targetKey,
    );
    const name = nodeText(forest, target);
    const message = `\`${name} ${operator}=\` already applies \`${name}\`, and the right side uses it again. Drop \`${name}\` from the right side, or write \`${name} = ...\` with the whole expression.`;
    return repeats ? [report(forest, target, message)] : [];
  });
}

function operandSlips(scanned, sources) {
  const forest = expressionForest(scanned);
  return [
    ...forest.roots.flatMap((root) => [
      ...operatorFindings(forest, root, sources),
      ...chainFindings(forest, root),
    ]),
    ...compoundFindings(forest),
  ];
}

/** Operands copied by mistake in production code: the same value on both sides, contradicting comparisons, `x * 0`, `a += a + b`. */
export function mainOperandSlips(scanned) {
  return operandSlips(scanned, 'main');
}

/**
 * The same without an operator applied to one value twice or to 0: a test may exercise `equals`,
 * `compareTo` or an overloaded operator that way (`assertEquals(zero, money - money)`).
 */
export function testOperandSlips(scanned) {
  return operandSlips(scanned, 'test');
}

export const kotlinSourceRules = {
  messages: MESSAGES,
  main: [mainOperandSlips],
  test: [testOperandSlips],
};
