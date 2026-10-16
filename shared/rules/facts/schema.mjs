import { readFileSync } from 'node:fs';

const ROLES = ['production', 'test'];
const KINDS = ['function', 'class', 'const', 'type', 'interface', 'enum'];

const isString = (value) => typeof value === 'string';
const isNonEmpty = (value) => isString(value) && value.length > 0;
const isLine = (value) => Number.isInteger(value) && value > 0;
const isBoolean = (value) => typeof value === 'boolean';
const isStrings = (value) => Array.isArray(value) && value.every(isString);
const isOptional = (check) => (value) => value === undefined || check(value);
const isOneOf = (choices) => (value) => choices.includes(value);
const isName = (value) =>
  typeof value === 'object' &&
  value !== null &&
  isNonEmpty(value.name) &&
  isOptional(isNonEmpty)(value.alias);
const isNames = (value) => Array.isArray(value) && value.every(isName);

const SHAPES = {
  modules: {
    file: isNonEmpty,
    role: isOneOf(ROLES),
    entry: isOptional(isBoolean),
  },
  packages: { root: isString, published: isBoolean },
  definitions: {
    file: isNonEmpty,
    name: isNonEmpty,
    kind: isOneOf(KINDS),
    line: isLine,
    exported: isBoolean,
    tokens: isStrings,
    lines: isOptional(isLine),
    literal: isOptional(isBoolean),
    usedLocally: isOptional(isBoolean),
    exportNames: isOptional(isStrings),
    key: isOptional(isString),
    text: isOptional(isString),
    entry: isOptional(isBoolean),
    package: isOptional(isString),
  },
  imports: {
    from: isNonEmpty,
    to: isNonEmpty,
    names: isNames,
    reexport: isOptional(isBoolean),
    role: isOptional(isOneOf(ROLES)),
  },
  docComments: { file: isNonEmpty, line: isLine, name: isNonEmpty, lines: isStrings },
  console: { file: isString, test: isString, messages: isStrings },
};

function itemProblem(list, item, index) {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return `facts.${list}[${String(index)}] must be an object`;
  }
  const field = Object.entries(SHAPES[list]).find(([key, check]) => !check(item[key]))?.[0];
  return field === undefined
    ? undefined
    : `facts.${list}[${String(index)}].${field} is ${JSON.stringify(item[field]) ?? 'missing'}`;
}

function listProblem(facts, list) {
  if (facts[list] === undefined) return undefined;
  if (!Array.isArray(facts[list])) return `facts.${list} must be an array`;
  return facts[list].map((item, index) => itemProblem(list, item, index)).find(Boolean);
}

export const FACT_LISTS = Object.keys(SHAPES);

export function validateFacts(facts) {
  if (typeof facts !== 'object' || facts === null || Array.isArray(facts)) {
    throw new TypeError('facts must be a JSON object');
  }
  const problem = FACT_LISTS.map((list) => listProblem(facts, list)).find(Boolean);
  if (problem !== undefined) {
    throw new TypeError(`${problem}; see "Facts schema" in docs/internals.md`);
  }
  return facts;
}

export function readFactsFile(file) {
  return validateFacts(JSON.parse(readFileSync(file, 'utf8')));
}
