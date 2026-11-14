import { term } from '../../logic/terms.mjs';
import { isPure } from '../canonical/effects.mjs';
import { KEY_MODES, keyOf, parameterPositions, shapeMode } from '../tree/keys.mjs';
import { contains, isBound, isJump } from '../tree/nodes.mjs';
import { isIntegerType, logicTerm } from './terms.mjs';

const STRICT_EQUALITY_FILE = /\.(?:java|kts?|py)$/u;

function parametersOf(tree) {
  const named = tree.children[1].children.map(({ children: [type, name] }, index) => {
    const parameter = term('name', `$p${String(index)}`);
    return [name, isIntegerType(type) ? { ...parameter, integer: true } : parameter];
  });
  return new Map(
    named.filter(([name]) => isBound(name)).map(([name, value]) => [name.value, value]),
  );
}

function assignmentOf(statement) {
  const [expression] = statement.kind === 'evaluate' ? statement.children : [];
  return expression?.kind === 'assign' &&
    expression.value === '=' &&
    isBound(expression.children[0])
    ? expression.children
    : undefined;
}

function conditionalAssignment(statement) {
  const [condition, then, otherwise] = statement.kind === 'if' ? statement.children : [];
  const [only] = then?.kind === 'block' && then.children.length === 1 ? then.children : [];
  const assigned = only === undefined ? undefined : assignmentOf(only);
  return otherwise?.kind === 'none' && assigned !== undefined
    ? { condition, target: assigned[0], value: assigned[1] }
    : undefined;
}

function preambleStep(statement, state) {
  if (statement.kind === 'declare' && isBound(statement.children[1])) {
    const [type, name, value] = statement.children;
    state.declared.push({ name: name.value, integer: isIntegerType(type) });
    return value.kind === 'none' ? [] : [{ target: name, value }];
  }
  const assigned = assignmentOf(statement);
  if (assigned !== undefined) {
    return [{ target: assigned[0], value: assigned[1] }];
  }
  const conditional = conditionalAssignment(statement);
  return conditional === undefined ? undefined : [conditional];
}

function withInteger(value, integer) {
  return integer && value !== undefined ? { ...value, integer: true } : value;
}

function applyStep(step, context, state) {
  if (!isPure(step.value) || (step.condition !== undefined && !isPure(step.condition))) {
    return false;
  }
  const integer = state.declared.find(({ name }) => name === step.target.value)?.integer ?? false;
  const value = withInteger(logicTerm(step.value, context), integer);
  const current = context.locals.get(step.target.value);
  if (step.condition === undefined) {
    context.locals.set(step.target.value, value);
    return value !== undefined;
  }
  const condition = logicTerm(step.condition, context);
  const joined =
    condition === undefined || value === undefined || current === undefined
      ? undefined
      : withInteger(term('conditional', undefined, [condition, value, current]), integer);
  context.locals.set(step.target.value, joined);
  return joined !== undefined;
}

function isPreambleStep(statement, context, state) {
  const steps = preambleStep(statement, state);
  return steps !== undefined && steps.every((step) => applyStep(step, context, state));
}

function guardOf(statement) {
  const [condition, then, otherwise] = statement.kind === 'if' ? statement.children : [];
  return otherwise?.kind === 'none' && isJump(then.children.at(-1))
    ? { condition, body: then }
    : undefined;
}

function returnedChoices(statement) {
  const choices = [];
  const pending = [statement];
  for (const current of pending) {
    const value = current.kind === 'return' ? current.children[0] : undefined;
    if (value?.kind === 'conditional') {
      const [condition, whenTrue, whenFalse] = value.children;
      choices.push({ condition, body: { kind: 'return', children: [whenTrue] } });
      pending.push({ kind: 'return', children: [whenFalse] });
    } else {
      choices.push({ body: current });
    }
  }
  return choices;
}

function usesLocals(node, parameters) {
  return contains(node, (current) => isBound(current) && !parameters.has(current.value));
}

function outcomeKey(body, mode) {
  const [only] = body.kind === 'block' && body.children.length === 1 ? body.children : [body];
  return keyOf(only, mode);
}

export function programOf(unit, tree) {
  const parameters = parametersOf(tree);
  const context = {
    parameters,
    locals: new Map(),
    strictEquality: STRICT_EQUALITY_FILE.test(unit.file),
  };
  const state = { declared: [] };
  const statements = tree.children[2].children;
  const preamble = statements.findIndex((statement) => !isPreambleStep(statement, context, state));
  const rest = preamble === -1 ? [] : statements.slice(preamble);
  const guardCount = rest.findIndex((statement) => guardOf(statement) === undefined);
  const guards = rest.slice(0, guardCount === -1 ? rest.length : guardCount).map(guardOf);
  const remainder = guardCount === -1 ? [] : rest.slice(guardCount);
  const choices = remainder.length === 1 ? returnedChoices(remainder[0]) : [{ body: remainder }];
  return { context, state, guards: [...guards, ...choices.slice(0, -1)], fallback: choices.at(-1) };
}

export function outcomesOf(program, tree) {
  const mode = shapeMode(parameterPositions(tree));
  const outcomes = program.guards.map(({ condition, body }) => ({
    condition: isPure(condition) ? logicTerm(condition, program.context) : undefined,
    key: usesLocals(body, program.context.parameters) ? undefined : outcomeKey(body, mode),
  }));
  return outcomes.every(({ condition, key }) => condition !== undefined && key !== undefined)
    ? outcomes
    : undefined;
}

export function fallbackKey(program, tree) {
  const { body } = program.fallback;
  const nodes = Array.isArray(body) ? { kind: 'block', children: body } : body;
  const mode = shapeMode(parameterPositions(tree));
  return `${keyOf(nodes, mode)}|${keyOf(nodes, KEY_MODES.exact)}`;
}
