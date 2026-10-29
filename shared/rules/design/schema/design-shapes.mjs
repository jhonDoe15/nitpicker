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
} from '../../facts/checks.mjs';

const TYPE_KINDS = ['class', 'data', 'interface', 'module', 'enum'];
const CALLABLE_KINDS = ['function', 'method', 'constructor', 'accessor'];

function isArgumentIndex(value) {
  return Number.isInteger(value) && value >= -1;
}

function isGroups(value) {
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
    mutation: optional(isNonEmpty),
  },
  paramUses: {
    param: isCount,
    fields: isStrings,
    forwards: (value) => Array.isArray(value),
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
    arguments: (value) => Array.isArray(value) && value.every(isArgumentIndex),
    returned: isBoolean,
  },
};

const isList = optional((value) => Array.isArray(value));

export const DESIGN_SHAPES = {
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

const NESTED_LISTS = {
  types: ['fields'],
  callables: ['params', 'calls', 'paramUses', 'decisions', 'reads'],
};

function describe(where, item, problem) {
  if (problem.field === undefined) {
    return `${where} must be an object`;
  }
  const value = item[problem.field];
  return `${where}.${problem.field} is ${value === undefined ? 'missing' : JSON.stringify(value)}`;
}

function nestedProblem(where, items, shape) {
  for (const [index, item] of (items ?? []).entries()) {
    const problem = shapeProblem(shape, item);
    if (problem !== undefined) {
      return describe(`${where}[${String(index)}]`, item, problem);
    }
  }
  return undefined;
}

function forwardsProblem(where, uses) {
  for (const [index, use] of (uses ?? []).entries()) {
    const problem = nestedProblem(
      `${where}[${String(index)}].forwards`,
      use.forwards,
      NESTED.forwards,
    );
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

function innerProblem(list, where, item) {
  const nested = NESTED_LISTS[list]
    .map((field) => nestedProblem(`${where}.${field}`, item[field], NESTED[field]))
    .find(Boolean);
  if (nested !== undefined || list !== 'callables') {
    return nested;
  }
  if (item.forward !== undefined) {
    const problem = shapeProblem(NESTED.forward, item.forward);
    if (problem !== undefined) {
      return describe(`${where}.forward`, item.forward, problem);
    }
  }
  return forwardsProblem(`${where}.paramUses`, item.paramUses);
}

export function designItemProblem(list, item, index) {
  const where = `facts.${list}[${String(index)}]`;
  const problem = shapeProblem(DESIGN_SHAPES[list], item);
  return problem === undefined ? innerProblem(list, where, item) : describe(where, item, problem);
}
