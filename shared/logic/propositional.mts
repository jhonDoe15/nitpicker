import { isSideEffectFree } from './purity.mts';
import { foldTerm, isBooleanLiteral, isComparison, isLogical, isNot, key } from './terms.mts';
import { operatorPairOf, required } from './typed/term-parts.mts';
import type { Term, Verdict } from './typed/term-types.mts';

type Value = boolean | string | symbol | undefined;
type Assignment = ReadonlyMap<string, Value>;
type Test = (assignment: Assignment) => boolean;
type Axis = { readonly name: string; readonly options: Value[] };
type Choice = {
  readonly value: string;
  readonly literal: string | undefined;
  readonly equal: boolean;
};
type Table = {
  readonly atoms: Set<string>;
  readonly choices: Map<string, Set<string | undefined>>;
  readonly fresh: Term[];
};

const MAX_ROWS = 4096;
const RELATIONS = new Set<string | undefined>(['===', '!==']);

function isRelation(node: Term): boolean {
  return isComparison(node) || (node.kind === 'binary' && RELATIONS.has(node.value));
}

function literalChoice(node: Term): Choice | undefined {
  const operands = operatorPairOf(node, RELATIONS);
  if (operands === undefined) {
    return undefined;
  }
  const [left, right] = operands;
  const [value, literal] = left.kind === 'literal' ? [right, left] : [left, right];
  const isChoice =
    literal.kind === 'literal' && value.kind !== 'literal' && isSideEffectFree(value);
  return isChoice
    ? { value: `value ${key(value)}`, literal: literal.value, equal: node.value === '===' }
    : undefined;
}

function atomKey(node: Term, fresh: Term[]): string {
  if (isSideEffectFree(node)) {
    return key(node);
  }
  fresh.push(node);
  return `occurrence ${String(fresh.length)}`;
}

function choiceTest(choice: Choice, choices: Table['choices']): Test {
  const literals = choices.get(choice.value) ?? new Set<string | undefined>();
  literals.add(choice.literal);
  choices.set(choice.value, literals);
  return (assignment) => (assignment.get(choice.value) === choice.literal) === choice.equal;
}

function junction(node: Term, children: Test[]): Test {
  const left = required(children[0], 'left operand');
  const right = required(children[1], 'right operand');
  return node.value === '&&'
    ? (assignment) => left(assignment) && right(assignment)
    : (assignment) => left(assignment) || right(assignment);
}

function connective(node: Term, children: Test[]): Test | undefined {
  if (isBooleanLiteral(node)) {
    const value = node.value === 'true';
    return () => value;
  }
  if (isNot(node)) {
    const operand = required(children[0], 'operand');
    return (assignment) => !operand(assignment);
  }
  if (isLogical(node, '&&') || isLogical(node, '||')) {
    return junction(node, children);
  }
  if (node.kind !== 'conditional') {
    return undefined;
  }
  const test = required(children[0], 'condition');
  const whenTrue = required(children[1], 'consequent');
  const whenFalse = required(children[2], 'alternate');
  return (assignment) => (test(assignment) ? whenTrue(assignment) : whenFalse(assignment));
}

function compile(root: Term, { atoms, choices, fresh }: Table): Test {
  return foldTerm<Test>(root, (node, children) => {
    const choice = literalChoice(node);
    if (choice !== undefined) {
      return choiceTest(choice, choices);
    }
    const compiled = connective(node, children);
    if (compiled !== undefined) {
      return compiled;
    }
    const name = atomKey(node, fresh);
    atoms.add(name);
    return (assignment) => assignment.get(name) === true;
  });
}

const OTHER = Symbol('another value');

function dimensions({ atoms, choices }: Table): Axis[] {
  return [
    ...[...atoms].map((name) => ({ name, options: [false, true] })),
    ...[...choices].map(([name, literals]) => ({ name, options: [...literals, OTHER] })),
  ];
}

function rowCount(axes: readonly Axis[]): number {
  return axes.reduce((product, { options }) => product * options.length, 1);
}

function assignment(axes: readonly Axis[], row: number): Assignment {
  const pairs: [string, Value][] = [];
  let rest = row;
  for (const { name, options } of axes) {
    pairs.push([name, options[rest % options.length]]);
    rest = Math.trunc(rest / options.length);
  }
  return new Map(pairs);
}

function verdict({ canHold, canFail }: { canHold: boolean; canFail: boolean }): Verdict {
  if (!(canHold || canFail)) {
    return 'unreachable';
  }
  if (!canFail) {
    return 'true';
  }
  return canHold ? 'open' : 'false';
}

function outcomes(
  axes: readonly Axis[],
  path: readonly Test[],
  asked: Test,
): { canHold: boolean; canFail: boolean } {
  const seen = { canHold: false, canFail: false };
  for (const row of Array.from({ length: rowCount(axes) }, (_, index) => index)) {
    const values = assignment(axes, row);
    if (path.every((condition) => condition(values))) {
      const holds = asked(values);
      seen.canHold ||= holds;
      seen.canFail ||= !holds;
    }
    if (seen.canHold && seen.canFail) {
      break;
    }
  }
  return seen;
}

export function decideByTruthTable(conditions: readonly Term[], query: Term): Verdict | undefined {
  const table: Table = { atoms: new Set(), choices: new Map(), fresh: [] };
  const path = conditions.map((condition) => compile(condition, table));
  const asked = compile(query, table);
  const axes = dimensions(table);
  if (rowCount(axes) > MAX_ROWS) {
    return undefined;
  }
  return verdict(outcomes(axes, path, asked));
}

function relationOperands(root: Term): string[] {
  return foldTerm<string[]>(root, (node, children) => {
    const below = children.flat();
    if (literalChoice(node) !== undefined) {
      return below;
    }
    const operands = node.children.filter((child) => child.kind !== 'literal');
    return isRelation(node) ? [...below, ...operands.map((child) => key(child))] : below;
  });
}

function choiceValues(root: Term): string[] {
  return foldTerm<string[]>(root, (node, children) => {
    const choice = literalChoice(node);
    const below = children.flat();
    return choice === undefined ? below : [...below, choice.value];
  });
}

function isChosenAndCompared(terms: readonly Term[]): boolean {
  const compared = new Set(terms.flatMap((root) => relationOperands(root)));
  return terms
    .flatMap((root) => choiceValues(root))
    .some((value) => compared.has(value.slice('value '.length)));
}

export function needsValues(conditions: readonly Term[], query: Term): boolean {
  const asked = relationOperands(query);
  const known = new Set(conditions.flatMap((condition) => relationOperands(condition)));
  const isLinked = asked.some(
    (operand, index) => known.has(operand) || asked.indexOf(operand) !== index,
  );
  return isLinked || isChosenAndCompared([...conditions, query]);
}
