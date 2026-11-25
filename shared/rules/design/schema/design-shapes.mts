import {
  isBoolean,
  isCount,
  isLine,
  isNonEmpty,
  isProjectPath,
  isRecord,
  isStrings,
  oneOf,
  optional,
  shapeProblem,
  type Check,
  type ShapeProblem,
} from '../../facts/checks.mts';
import { fieldOf, listOf } from '../../../values/readers.mts';

type Shape = Readonly<Record<string, Check>>;

const TYPE_KINDS = ['class', 'data', 'interface', 'module', 'enum'];
const CALLABLE_KINDS = ['function', 'method', 'constructor', 'accessor'];

function isArgumentIndex(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= -1;
}

function isGroups(value: unknown): boolean {
  return Array.isArray(value) && value.every(isStrings);
}

const NESTED = {
  fields: { name: isNonEmpty, mutable: optional(isBoolean), private: optional(isBoolean) },
  params: {
    name: isNonEmpty,
    type: optional(isNonEmpty),
    variadic: optional(isBoolean),
    optional: optional(isBoolean),
    pattern: optional(isBoolean),
  },
  calls: {
    target: isNonEmpty,
    line: isLine,
    receiver: optional(isNonEmpty),
    cleanup: optional(isBoolean),
    branch: optional(isStrings),
    mutation: optional(isNonEmpty),
  },
  paramUses: {
    param: isCount,
    fields: isStrings,
    forwards: (value: unknown) => Array.isArray(value),
    opaque: optional(isBoolean),
  },
  forwards: { target: isNonEmpty, position: isCount },
  decisions: {
    subject: isNonEmpty,
    groups: isGroups,
    line: isLine,
    otherwise: optional(isBoolean),
  },
  reads: { type: isNonEmpty, fields: isStrings, decided: optional(isStrings), line: isLine },
  forward: {
    target: isNonEmpty,
    arguments: (value: unknown) => Array.isArray(value) && value.every(isArgumentIndex),
    returned: isBoolean,
  },
};

const NESTED_SHAPES: Readonly<Record<string, Shape>> = NESTED;

const isList = optional((value: unknown) => Array.isArray(value));

export const DESIGN_SHAPES: Readonly<Record<string, Shape>> = {
  types: {
    id: isNonEmpty,
    file: isProjectPath,
    name: isNonEmpty,
    line: isLine,
    kind: oneOf(TYPE_KINDS),
    exported: isBoolean,
    fields: isList,
    supertypes: optional(isStrings),
    cases: optional(isStrings),
    published: optional(isBoolean),
    references: optional(isStrings),
  },
  callables: {
    id: isNonEmpty,
    file: isProjectPath,
    name: isNonEmpty,
    line: isLine,
    kind: oneOf(CALLABLE_KINDS),
    exported: isBoolean,
    owner: optional(isNonEmpty),
    entry: optional(isBoolean),
    published: optional(isBoolean),
    params: isList,
    returns: optional(isNonEmpty),
    forward: optional(isRecord),
    calls: isList,
    paramUses: isList,
    ownFields: optional(isStrings),
    returnsField: optional(isNonEmpty),
    decisions: isList,
    reads: isList,
    references: optional(isStrings),
  },
};

const NESTED_LISTS: Readonly<Record<string, readonly string[]>> = {
  types: ['fields'],
  callables: ['params', 'calls', 'paramUses', 'decisions', 'reads'],
};

function describe(where: string, item: unknown, problem: ShapeProblem): string {
  if (problem.field === undefined) {
    return `${where} must be an object`;
  }
  const value = fieldOf(item, problem.field);
  return `${where}.${problem.field} is ${value === undefined ? 'missing' : JSON.stringify(value)}`;
}

function nestedProblem(
  where: string,
  items: unknown,
  shape: Shape | undefined,
): string | undefined {
  if (shape === undefined) {
    return undefined;
  }
  for (const [index, item] of listOf(items).entries()) {
    const problem = shapeProblem(shape, item);
    if (problem !== undefined) {
      return describe(`${where}[${String(index)}]`, item, problem);
    }
  }
  return undefined;
}

function forwardsProblem(where: string, uses: unknown): string | undefined {
  for (const [index, use] of listOf(uses).entries()) {
    const problem = nestedProblem(
      `${where}[${String(index)}].forwards`,
      fieldOf(use, 'forwards'),
      NESTED.forwards,
    );
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

function innerProblem(list: string, where: string, item: unknown): string | undefined {
  const nested = (NESTED_LISTS[list] ?? [])
    .map((field) => nestedProblem(`${where}.${field}`, fieldOf(item, field), NESTED_SHAPES[field]))
    .find(Boolean);
  if (nested !== undefined || list !== 'callables') {
    return nested;
  }
  const forward = fieldOf(item, 'forward');
  if (forward !== undefined) {
    const problem = shapeProblem(NESTED.forward, forward);
    if (problem !== undefined) {
      return describe(`${where}.forward`, forward, problem);
    }
  }
  return forwardsProblem(`${where}.paramUses`, fieldOf(item, 'paramUses'));
}

export function designItemProblem(list: string, item: unknown, index: number): string | undefined {
  const where = `facts.${list}[${String(index)}]`;
  const problem = shapeProblem(DESIGN_SHAPES[list] ?? {}, item);
  return problem === undefined ? innerProblem(list, where, item) : describe(where, item, problem);
}
