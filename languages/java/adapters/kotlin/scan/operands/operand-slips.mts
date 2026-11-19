import { depthFirst } from '../typed/typed-scan.mts';
import { comparisonVerdict, constantComparison } from './constant-comparisons.mts';
import type { ConstantComparison, Verdict } from './constant-comparisons.mts';
import {
  expressionForest,
  isEffectFree,
  isStable,
  nodeKey,
  nodeSize,
  expressionNodes,
  nodeText,
  unwrapped,
} from './operand-terms.mts';
import type { Scanned } from '../typed/scan-shapes.mts';
import type { Reported } from '../typed/rule-shapes.mts';
import type { Forest, Node, Tree } from '../typed/operand-shapes.mts';

type Slip = Required<Reported>;
type Sources = 'main' | 'test';

const RULE = 'OperandSlip';
const SELF_OPERATORS = new Set(['<', '<=', '>', '>=', '-', '/', '%', 'and', 'or', 'xor']);
const EQUALITIES = new Set(['==', '!=', '===', '!==']);
const ERASING = new Set(['*', 'and']);
const ZEROS = new Set(['0', '0L']);
const CHAINS = new Set(['&&', '||']);
const COMMUTATIVE = new Set(['+', '*']);
const PLAIN = /^[\w.?!`]+$/;
const NAN_NAME = /^[\w`]+(?:\.[\w`]+)*$/;
const MAX_COMPARED = 16;
const FIX_COPY = 'One side was probably copied: fix the operand that was meant to differ.';

const MESSAGES = {
  [RULE]:
    'An operand looks copied by mistake: the same value on both sides of an operator or twice in one `&&`/`||` chain, comparisons of one value that contradict or repeat each other, `x * 0`, or `a += a + b`. The finding names the slip.',
};

function report(forest: Forest, node: Tree, message: string): Slip {
  const offset = forest.tokens[node.first]?.start ?? 0;
  return { rule: RULE, offset, subject: `${message}\0${nodeText(forest, node)}`, message };
}

function sameOperandMessage(forest: Forest, node: Node): string | undefined {
  const checked = SELF_OPERATORS.has(node.operator) || EQUALITIES.has(node.operator);
  if (
    !checked ||
    nodeSize(forest, node.left) !== nodeSize(forest, node.right) ||
    !isStable(forest, node.left) ||
    nodeKey(forest, node.left) !== nodeKey(forest, node.right)
  ) {
    return undefined;
  }
  const operand = nodeText(forest, node.left);
  if ((node.operator === '==' || node.operator === '!=') && NAN_NAME.test(operand)) {
    return `\`${operand}\` is compared with itself. If this is a NaN test on a \`Double\` or \`Float\`, write \`${operand}.isNaN()\`. ${FIX_COPY}`;
  }
  return `\`${operand}\` is on both sides of \`${node.operator}\`. ${FIX_COPY}`;
}

function isZero(forest: Forest, node: Tree): boolean {
  const inner = unwrapped(forest, node);
  return (
    inner.operator === undefined &&
    inner.items.length === 1 &&
    ZEROS.has(forest.tokens[inner.items[0]?.token ?? -1]?.text ?? '')
  );
}

function isConstant(forest: Forest, node: Tree): boolean {
  const inner = unwrapped(forest, node);
  if (inner.operator !== undefined) {
    return false;
  }
  const kinds = inner.items.map((item) => forest.tokens[item.token]?.kind);
  return kinds.at(-1) === 'number' && inner.items.at(-1)?.close === undefined;
}

function erasingMessage(forest: Forest, node: Node): string | undefined {
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
  return `\`${node.operator} 0\` erases \`${operand}\`: a number times 0 is 0 whatever it holds (or -0.0 or NaN for a \`Double\`). Write the value meant, or fix the operand.`;
}

function operatorFindings(forest: Forest, root: Tree, sources: Sources): Slip[] {
  return [...expressionNodes(root)].flatMap((node) => {
    if (node.operator === undefined) {
      return [];
    }
    const message =
      sources === 'main'
        ? (sameOperandMessage(forest, node) ?? erasingMessage(forest, node))
        : undefined;
    return message === undefined ? [] : [report(forest, node, message)];
  });
}

function chainOperands(forest: Forest, chain: Node): Tree[] {
  return [
    ...depthFirst<Tree>(chain, (node: Tree) => {
      const inner = unwrapped(forest, node);
      return inner.operator === chain.operator ? [inner.left, inner.right] : [];
    }),
  ].filter((node) => unwrapped(forest, node).operator !== chain.operator);
}

function segments(forest: Forest, operands: Tree[]): Tree[][] {
  const runs: Tree[][] = [[]];
  for (const operand of operands) {
    runs.at(-1)?.push(operand);
    if (!isEffectFree(forest, operand)) {
      runs.push([]);
    }
  }
  return runs;
}

function repeatedMessages(forest: Forest, operator: string, run: Tree[]): string[] {
  const seen = new Set<string>();
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

function verdictMessage({ verdict, redundant, deciding }: Verdict): string {
  const messages: Record<string, string> = {
    impossible:
      'These comparisons of one value cannot both hold, so this `&&` is always false. Fix the constant or operator that was copied.',
    always:
      'Together these comparisons of one value always hold, so this `||` is always true. Fix the constant or operator that was copied.',
    implied: `\`${redundant?.text ?? ''}\` already follows from \`${deciding?.text ?? ''}\`, so it checks nothing. Remove it, or fix its constant or operator.`,
    covered: `\`${redundant?.text ?? ''}\` adds nothing: \`${deciding?.text ?? ''}\` holds whenever it does. Remove it, or fix its constant or operator.`,
  };
  return messages[verdict] ?? '';
}

function comparisonMessages(forest: Forest, operator: string, run: Tree[]): string[] {
  const comparisons = run
    .map((operand) => constantComparison(forest, operand))
    .filter((comparison): comparison is ConstantComparison => comparison !== undefined);
  const bySubject = Map.groupBy(comparisons, ({ subjectKey }) => subjectKey);
  return [...bySubject.values()].flatMap((group) =>
    subjectMessages(operator, group.slice(0, MAX_COMPARED)),
  );
}

function subjectMessages(operator: string, comparisons: ConstantComparison[]): string[] {
  return comparisons.flatMap((first, index) =>
    comparisons
      .slice(index + 1)
      .filter((second) => second.key !== first.key)
      .map((second) => comparisonVerdict(operator, first, second))
      .filter((verdict): verdict is Verdict => verdict !== undefined)
      .map((verdict) => verdictMessage(verdict)),
  );
}

function isChainHead(node: Tree): node is Node {
  return (
    node.operator !== undefined &&
    CHAINS.has(node.operator) &&
    node.parent?.operator !== node.operator
  );
}

function chainFindings(forest: Forest, root: Tree): Slip[] {
  return [...expressionNodes(root)]
    .filter((node): node is Node => isChainHead(node))
    .flatMap((chain) => {
      const runs = segments(forest, chainOperands(forest, chain));
      const messages = runs.flatMap((run) => [
        ...repeatedMessages(forest, chain.operator, run),
        ...comparisonMessages(forest, chain.operator, run),
      ]);
      return [...new Set(messages)].map((message) => report(forest, chain, message));
    });
}

function compoundOperands(forest: Forest, value: Tree, operator: string): Tree[] {
  const root = unwrapped(forest, value);
  if (root.operator !== operator) {
    return [];
  }
  const spine = [
    ...depthFirst<Tree>(root, (node: Tree) => {
      const inner = unwrapped(forest, node);
      return inner.operator === operator ? [inner.left] : [];
    }),
  ].map((node) => unwrapped(forest, node));
  const leftmost = spine.at(-1);
  const leftmostNodes = leftmost === undefined ? [] : [leftmost];
  if (!COMMUTATIVE.has(operator)) {
    return leftmostNodes;
  }
  return [
    ...leftmostNodes,
    ...spine.flatMap((node) => (node.operator === operator ? [node.right] : [])),
  ];
}

function compoundFindings(forest: Forest): Slip[] {
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

function operandSlips(scanned: Scanned, sources: Sources): Slip[] {
  const forest = expressionForest(scanned);
  return [
    ...forest.roots.flatMap((root) => [
      ...operatorFindings(forest, root, sources),
      ...chainFindings(forest, root),
    ]),
    ...compoundFindings(forest),
  ];
}

export function mainOperandSlips(scanned: Scanned): Slip[] {
  return operandSlips(scanned, 'main');
}

export function testOperandSlips(scanned: Scanned): Slip[] {
  return operandSlips(scanned, 'test');
}

export const kotlinSourceRules = {
  messages: MESSAGES,
  main: [mainOperandSlips],
  test: [testOperandSlips],
};
