import { readFileSync } from 'node:fs';
import { isCount } from '../../config.mjs';

const ROLES = ['production', 'test'];
const KINDS = ['function', 'class', 'const', 'type', 'interface', 'enum'];
const SCHEMA_DOCS = 'see "Facts schema" in docs/internals.md';
const PATH_RULE =
  'paths are project-relative with "/" separators, without "./", ".." or a trailing "/"';

function isString(value) {
  return typeof value === 'string';
}

function isNonEmpty(value) {
  return isString(value) && value.length > 0;
}

function isLine(value) {
  return Number.isInteger(value) && value > 0;
}

function isBoolean(value) {
  return typeof value === 'boolean';
}

function isStrings(value) {
  return Array.isArray(value) && value.every(isString);
}

function isProjectPath(value) {
  return (
    isNonEmpty(value) &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/u.test(value) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function isRootOrPath(value) {
  return value === '' || isProjectPath(value);
}

function optional(check) {
  return (value) => value === undefined || check(value);
}

function oneOf(choices) {
  return (value) => choices.includes(value);
}

function isName(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    isNonEmpty(value.name) &&
    optional(isNonEmpty)(value.alias)
  );
}

function isNames(value) {
  return Array.isArray(value) && value.every(isName);
}

const OPTIONAL_PATH = optional(isRootOrPath);
const PATH_CHECKS = new Set([isProjectPath, isRootOrPath, OPTIONAL_PATH]);

const SHAPES = {
  modules: {
    file: isProjectPath,
    role: oneOf(ROLES),
    entry: optional(isBoolean),
  },
  packages: { root: isRootOrPath, published: isBoolean },
  definitions: {
    file: isProjectPath,
    name: isNonEmpty,
    kind: oneOf(KINDS),
    line: isLine,
    exported: isBoolean,
    tokens: isStrings,
    qualifier: optional(isNonEmpty),
    lines: optional(isLine),
    size: optional(isCount),
    literal: optional(isBoolean),
    usedLocally: optional(isBoolean),
    exportNames: optional(isStrings),
    key: optional(isString),
    text: optional(isString),
    entry: optional(isBoolean),
    package: OPTIONAL_PATH,
  },
  imports: {
    from: isProjectPath,
    to: isProjectPath,
    names: isNames,
    reexport: optional(isBoolean),
  },
  docComments: {
    file: isProjectPath,
    line: isLine,
    name: isNonEmpty,
    qualifier: optional(isNonEmpty),
    lines: isStrings,
  },
  console: { file: isRootOrPath, test: isString, messages: isStrings },
};

const FACT_LISTS = Object.keys(SHAPES);

function isModule(known, file) {
  return known.has(file);
}

function isModuleOrFolder(known, file) {
  return (
    file === '' || known.has(file) || [...known].some((module) => module.startsWith(`${file}/`))
  );
}

const MODULE_REFERENCES = [
  ['imports', 'from', isModule],
  ['imports', 'to', isModule],
  ['definitions', 'file', isModule],
  ['docComments', 'file', isModule],
  ['console', 'file', isModuleOrFolder],
];

const REFERENCE_NOUNS = { docComments: 'doc comment', console: 'console entry' };

function itemProblem(list, item, index) {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return `facts.${list}[${String(index)}] must be an object`;
  }
  const [field, check] = Object.entries(SHAPES[list]).find(([key, test]) => !test(item[key])) ?? [];
  if (field === undefined) {
    return undefined;
  }
  const value = item[field] === undefined ? 'missing' : JSON.stringify(item[field]);
  const hint = PATH_CHECKS.has(check) && isString(item[field]) ? `: ${PATH_RULE}` : '';
  return `facts.${list}[${String(index)}].${field} is ${value}${hint}`;
}

function listProblem(facts, list) {
  if (facts[list] === undefined) {
    return undefined;
  }
  if (!Array.isArray(facts[list])) {
    return `facts.${list} must be an array`;
  }
  return facts[list].map((item, index) => itemProblem(list, item, index)).find(Boolean);
}

function danglingReference({ list, field, index, value }) {
  const noun = REFERENCE_NOUNS[list] ?? list.slice(0, -1);
  const where = `facts.${list}[${String(index)}].${field} is ${JSON.stringify(value)}`;
  return `${where}, which is not in facts.modules: list that file in modules, or leave the ${noun} out`;
}

function referenceProblem(facts) {
  if (!Array.isArray(facts.modules)) {
    return undefined;
  }
  const known = new Set(facts.modules.map(({ file }) => file));
  const problems = MODULE_REFERENCES.map(([list, field, isKnown]) => {
    const items = facts[list] ?? [];
    const index = items.findIndex((item) => !isKnown(known, item[field]));
    return index === -1
      ? undefined
      : danglingReference({ list, field, index, value: items[index][field] });
  });
  return problems.find(Boolean);
}

export function validateFacts(facts) {
  if (typeof facts !== 'object' || facts === null || Array.isArray(facts)) {
    throw new TypeError('facts must be a JSON object');
  }
  const problem =
    FACT_LISTS.map((list) => listProblem(facts, list)).find(Boolean) ?? referenceProblem(facts);
  if (problem !== undefined) {
    throw new TypeError(`${problem}; ${SCHEMA_DOCS}`);
  }
  return facts;
}

export function readFactsFile(file) {
  return validateFacts(JSON.parse(readFileSync(file, 'utf8')));
}
