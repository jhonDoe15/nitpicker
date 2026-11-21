import { foldTerm, isBooleanValued, term } from '../../logic/terms.mts';
import type { Term } from '../../logic/typed/term-types.mts';
import { counterexampleSync, decideSync } from '../../logic/sync/decide-sync.mts';
import { THRESHOLDS } from '../thresholds/thresholds.mts';
import { KEY_MODES, keyOf } from '../tree/keys.mts';
import { isOneOf, pairOf, present, sizeOf } from '../tree/nodes.mts';
import type { NearUnit, TreeNode } from '../tree/tree-types.mts';
import { fallbackKey, outcomesOf, programOf } from './program.mts';
import type { Outcome, Program } from './program.mts';

export type ProofSide = { readonly unit: Pick<NearUnit, 'file'>; readonly tree: TreeNode };
export type Proof =
  | { readonly proved: true }
  | {
      readonly proved: false;
      readonly subject: string;
      readonly counterexample: string | undefined;
    };

type Check = { readonly subject: string; readonly query: Term };
type Facts = { readonly integral: boolean; readonly valid: boolean };

const MAX_OUTCOMES = 12;
const SOLVER_TIMEOUT_MS = 120_000;
const INTEGER = /^-?\d+$/u;
const ARITHMETIC = new Set(['+', '-', '*']);
const NUMERIC = new Set([...ARITHMETIC, '<', '<=', '>', '>=', '===', '!==']);
const LEAVES = new Set(['name', 'member', 'call', 'index']);
const PARAMETER_ATOM = /name:"\$p(?<index>\d+)"/gu;
const VALUE_ATOM = /name:"#value (?<text>[^"]*)"/gu;
const PARAMETER = /\$p(?<index>\d+)/gu;

function and(left: Term, right: Term): Term {
  return term('logical', '&&', [left, right]);
}

function or(left: Term, right: Term): Term {
  return term('logical', '||', [left, right]);
}

function not(operand: Term): Term {
  return term('unary', '!', [operand]);
}

function iff(left: Term, right: Term): Term {
  return or(and(left, right), and(not(left), not(right)));
}

function sameValue(left: Term, right: Term): Term {
  return isBooleanValued(left) || isBooleanValued(right)
    ? iff(left, right)
    : term('binary', '===', [left, right]);
}

function integralOf(node: Term, children: readonly Facts[]): boolean {
  if (node.kind === 'literal') {
    return INTEGER.test(node.value ?? '');
  }
  if (LEAVES.has(node.kind)) {
    return node.integer === true;
  }
  if (node.kind === 'conditional') {
    return present(children[1]).integral && present(children[2]).integral;
  }
  const arithmetic =
    (node.kind === 'binary' && isOneOf(ARITHMETIC, node.value)) ||
    (node.kind === 'unary' && node.value === '-');
  return arithmetic && children.every((child) => child.integral);
}

function isNumericUse(node: Term): boolean {
  return (
    (node.kind === 'binary' && isOneOf(NUMERIC, node.value)) ||
    (node.kind === 'unary' && node.value === '-')
  );
}

function isIntegerQuery(query: Term): boolean {
  return foldTerm<Facts>(query, (node, children) => ({
    integral: integralOf(node, children),
    valid:
      children.every((child) => child.valid) &&
      (!isNumericUse(node) || children.every((child) => child.integral)),
  })).valid;
}

function firingConditions(outcomes: readonly Outcome[]): Map<string, Term> {
  const firing = new Map<string, Term>();
  const before: Term[] = [];
  for (const { condition, key } of outcomes) {
    const fires = before.reduceRight((rest, previous) => and(not(previous), rest), condition);
    const known = firing.get(key);
    firing.set(key, known === undefined ? fires : or(known, fires));
    before.push(condition);
  }
  return firing;
}

function localValues(program: Program): (Term | undefined)[] {
  return program.state.declared.map(({ name }) => program.context.locals.get(name));
}

function outcomeChecks(left: readonly Outcome[], right: readonly Outcome[]): Check[] | undefined {
  const mine = firingConditions(left);
  const theirs = firingConditions(right);
  const keys = [...new Set([...mine.keys(), ...theirs.keys()])];
  if (keys.some((key) => !(mine.has(key) && theirs.has(key)))) {
    return undefined;
  }
  return keys.map((key, index) => ({
    subject: `outcome ${String(index + 1)}`,
    query: iff(present(mine.get(key)), present(theirs.get(key))),
  }));
}

function localChecks(left: Program, right: Program): Check[] | undefined {
  const mine = localValues(left);
  const theirs = localValues(right);
  if (mine.length !== theirs.length || [...mine, ...theirs].some((value) => value === undefined)) {
    return undefined;
  }
  return mine.map((value, index) => ({
    subject: `local ${String(index + 1)}`,
    query: sameValue(present(value), present(theirs[index])),
  }));
}

function checksOf(sides: readonly [ProofSide, ProofSide]): Check[] | undefined {
  const [left, right] = sides;
  const leftProgram = programOf(left.unit, left.tree);
  const rightProgram = programOf(right.unit, right.tree);
  const leftOutcomes = outcomesOf(leftProgram, left.tree);
  const rightOutcomes = outcomesOf(rightProgram, right.tree);
  const comparable =
    [leftOutcomes, rightOutcomes].every(
      (list) => list !== undefined && list.length <= MAX_OUTCOMES,
    ) && fallbackKey(leftProgram, left.tree) === fallbackKey(rightProgram, right.tree);
  if (!comparable || leftOutcomes === undefined || rightOutcomes === undefined) {
    return undefined;
  }
  const outcomes = outcomeChecks(leftOutcomes, rightOutcomes);
  const locals = localChecks(leftProgram, rightProgram);
  return outcomes === undefined || locals === undefined ? undefined : [...outcomes, ...locals];
}

function isLargeEnough({ tree }: ProofSide): boolean {
  return sizeOf(tree) >= THRESHOLDS.minSharedNodes;
}

function signatureOf({ tree }: ProofSide): string | undefined {
  const [returned, parameters] = pairOf(tree);
  const types = [returned, ...parameters.children.map(({ children: [type] }) => type)];
  const known = types.filter((type) => type !== undefined);
  return known.length === types.length
    ? known.map((type) => keyOf(type, KEY_MODES.exact)).join('|')
    : undefined;
}

function isSameSignature(sides: readonly [ProofSide, ProofSide]): boolean {
  const [signature, other] = sides.map(signatureOf);
  return signature !== undefined && signature === other;
}

function optionsOf(query: Term): { timeoutMs: number; integers: boolean } {
  return { timeoutMs: SOLVER_TIMEOUT_MS, integers: isIntegerQuery(query) };
}

function parameterNamer(
  names: readonly (string | undefined)[],
): (atom: string, index: string) => string {
  return (atom, index) => names[Number(index)] ?? atom;
}

function readable(counterexample: unknown, { tree }: ProofSide): string | undefined {
  const names = present(tree.children[1]).children.map(({ children: [, name] }) => {
    const found = present(name);
    return found.text ?? found.value;
  });
  const named = parameterNamer(names);
  return typeof counterexample === 'string'
    ? counterexample
        .replaceAll(
          VALUE_ATOM,
          (_atom: string, text: string) => `(${text.replaceAll(PARAMETER, named)})`,
        )
        .replaceAll(PARAMETER_ATOM, named)
    : undefined;
}

export function proveSameLogic(sides: readonly [ProofSide, ProofSide]): Proof | undefined {
  if (!(sides.every(isLargeEnough) && isSameSignature(sides))) {
    return undefined;
  }
  const checks = checksOf(sides);
  if (checks === undefined || checks.length === 0) {
    return undefined;
  }
  const failed = checks.find(({ query }) => decideSync([], query, optionsOf(query)) !== 'true');
  if (failed === undefined) {
    return { proved: true };
  }
  const counterexample = counterexampleSync([], failed.query, optionsOf(failed.query));
  return {
    proved: false,
    subject: failed.subject,
    counterexample: readable(counterexample, sides[0]),
  };
}
