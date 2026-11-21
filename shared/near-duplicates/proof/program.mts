import { term } from '../../logic/terms.mts';
import type { Term } from '../../logic/typed/term-types.mts';
import { isPure } from '../canonical/effects.mts';
import { KEY_MODES, keyOf, parameterPositions, shapeMode } from '../tree/keys.mts';
import { contains, isBound, isJump, present, tripleOf } from '../tree/nodes.mts';
import type { KeyMode, NearUnit, TreeNode } from '../tree/tree-types.mts';
import { isIntegerType, logicTerm } from './terms.mts';
import type { TermContext } from './terms.mts';

type Declared = { readonly name: string; readonly integer: boolean };
type Guard = { readonly condition: TreeNode; readonly body: TreeNode };
type Fallback = { readonly body: TreeNode | readonly TreeNode[] };
export type Outcome = { readonly condition: Term; readonly key: string };

type ProgramContext = TermContext & {
  readonly parameters: Map<string, Term>;
  readonly locals: Map<string, Term | undefined>;
};

export type Program = {
  readonly context: ProgramContext;
  readonly state: { readonly declared: Declared[] };
  readonly guards: readonly Guard[];
  readonly fallback: Fallback;
};

type Step = { readonly target: TreeNode; readonly value: TreeNode; readonly condition?: TreeNode };
type Assignment = { readonly target: TreeNode; readonly value: TreeNode };
type State = Program['state'];

const STRICT_EQUALITY_FILE = /\.(?:java|kts?|py)$/u;

function parametersOf(tree: TreeNode): Map<string, Term> {
  const parameters = present(tree.children[1]).children;
  return new Map(
    parameters.flatMap((parameter, index): [string, Term][] => {
      const [type, name] = parameter.children;
      const value = term('name', `$p${String(index)}`);
      return isBound(name)
        ? [[name.value, isIntegerType(type) ? { ...value, integer: true } : value]]
        : [];
    }),
  );
}

function assignmentOf(statement: TreeNode): Assignment | undefined {
  const [expression] = statement.kind === 'evaluate' ? statement.children : [];
  const target = expression?.children[0];
  return expression?.kind === 'assign' && expression.value === '=' && isBound(target)
    ? { target, value: present(expression.children[1]) }
    : undefined;
}

function conditionalAssignment(statement: TreeNode): Step | undefined {
  const [condition, then, otherwise] = statement.kind === 'if' ? statement.children : [];
  const [only] = then?.kind === 'block' && then.children.length === 1 ? then.children : [];
  const assigned = only === undefined ? undefined : assignmentOf(only);
  return condition !== undefined && otherwise?.kind === 'none' && assigned !== undefined
    ? { condition, target: assigned.target, value: assigned.value }
    : undefined;
}

function preambleStep(statement: TreeNode, state: State): Step[] | undefined {
  const name = statement.children[1];
  if (statement.kind === 'declare' && isBound(name)) {
    const value = present(statement.children[2]);
    state.declared.push({ name: name.value, integer: isIntegerType(statement.children[0]) });
    return value.kind === 'none' ? [] : [{ target: name, value }];
  }
  const assigned = assignmentOf(statement);
  if (assigned !== undefined) {
    return [assigned];
  }
  const conditional = conditionalAssignment(statement);
  return conditional === undefined ? undefined : [conditional];
}

function withInteger(value: Term | undefined, integer: boolean): Term | undefined {
  return integer && value !== undefined ? { ...value, integer: true } : value;
}

function applyStep(step: Step, context: ProgramContext, state: State): boolean {
  if (!isPure(step.value) || (step.condition !== undefined && !isPure(step.condition))) {
    return false;
  }
  const targetName = present(step.target.value);
  const integer = state.declared.find(({ name }) => name === targetName)?.integer ?? false;
  const value = withInteger(logicTerm(step.value, context), integer);
  const current = context.locals.get(targetName);
  if (step.condition === undefined) {
    context.locals.set(targetName, value);
    return value !== undefined;
  }
  const condition = logicTerm(step.condition, context);
  const joined =
    condition === undefined || value === undefined || current === undefined
      ? undefined
      : withInteger(term('conditional', undefined, [condition, value, current]), integer);
  context.locals.set(targetName, joined);
  return joined !== undefined;
}

function isPreambleStep(statement: TreeNode, context: ProgramContext, state: State): boolean {
  const steps = preambleStep(statement, state);
  return steps !== undefined && steps.every((step) => applyStep(step, context, state));
}

function guardOf(statement: TreeNode): Guard | undefined {
  const [condition, then, otherwise] = statement.kind === 'if' ? statement.children : [];
  return condition !== undefined &&
    then !== undefined &&
    otherwise?.kind === 'none' &&
    isJump(then.children.at(-1))
    ? { condition, body: then }
    : undefined;
}

function returnedChoices(statement: TreeNode): Pick<Program, 'guards' | 'fallback'> {
  const guards: Guard[] = [];
  let fallback: Fallback = { body: statement };
  const pending = [statement];
  for (const current of pending) {
    const value = current.kind === 'return' ? current.children[0] : undefined;
    if (value?.kind === 'conditional') {
      const [condition, whenTrue, whenFalse] = tripleOf(value);
      guards.push({ condition, body: { kind: 'return', children: [whenTrue] } });
      pending.push({ kind: 'return', children: [whenFalse] });
    } else {
      fallback = { body: current };
    }
  }
  return { guards, fallback };
}

function usesLocals(node: TreeNode, parameters: ReadonlyMap<string, Term>): boolean {
  return contains(node, (current) => isBound(current) && !parameters.has(current.value));
}

function outcomeKey(body: TreeNode, mode: KeyMode): string {
  const [only] = body.kind === 'block' && body.children.length === 1 ? body.children : [body];
  return keyOf(present(only), mode);
}

export function programOf(unit: Pick<NearUnit, 'file'>, tree: TreeNode): Program {
  const parameters = parametersOf(tree);
  const context: ProgramContext = {
    parameters,
    locals: new Map(),
    strictEquality: STRICT_EQUALITY_FILE.test(unit.file),
    looseBooleans: false,
    exactIntegers: false,
  };
  const state: State = { declared: [] };
  const statements = present(tree.children[2]).children;
  const preamble = statements.findIndex((statement) => !isPreambleStep(statement, context, state));
  const rest = preamble === -1 ? [] : statements.slice(preamble);
  const guardCount = rest.findIndex((statement) => guardOf(statement) === undefined);
  const guards = rest
    .slice(0, guardCount === -1 ? rest.length : guardCount)
    .flatMap((statement) => guardOf(statement) ?? []);
  const remainder = guardCount === -1 ? [] : rest.slice(guardCount);
  const [single] = remainder;
  const choices =
    remainder.length === 1 && single !== undefined
      ? returnedChoices(single)
      : { guards: [], fallback: { body: remainder } };
  return {
    context,
    state,
    guards: [...guards, ...choices.guards],
    fallback: choices.fallback,
  };
}

function isResolved(outcome: {
  readonly condition: Term | undefined;
  readonly key: string | undefined;
}): outcome is Outcome {
  return outcome.condition !== undefined && outcome.key !== undefined;
}

export function outcomesOf(program: Program, tree: TreeNode): Outcome[] | undefined {
  const mode = shapeMode(parameterPositions(tree));
  const outcomes = program.guards.map(({ condition, body }) => ({
    condition: isPure(condition) ? logicTerm(condition, program.context) : undefined,
    key: usesLocals(body, program.context.parameters) ? undefined : outcomeKey(body, mode),
  }));
  const resolved = outcomes.filter(isResolved);
  return resolved.length === outcomes.length ? resolved : undefined;
}

export function fallbackKey(program: Program, tree: TreeNode): string {
  const { body } = program.fallback;
  const nodes: TreeNode = 'kind' in body ? body : { kind: 'block', children: body };
  const mode = shapeMode(parameterPositions(tree));
  return `${keyOf(nodes, mode)}|${keyOf(nodes, KEY_MODES.exact)}`;
}
