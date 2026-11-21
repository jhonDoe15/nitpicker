import { readFileSync } from 'node:fs';
import {
  isBoolean,
  isCount,
  isRecord,
  isLine,
  isNonEmpty,
  isProjectPath,
  isRootOrPath,
  isString,
  isStrings,
  oneOf,
  optional,
  type Check,
} from './checks.mts';
import { DESIGN_SHAPES, designItemProblem } from '../design/schema/design-shapes.mts';
import { designReferenceProblem } from '../design/schema/design-references.mts';
import { fieldOf, listOf, messageOf } from '../../values/readers.mts';
import type { Facts } from './typed/fact-types.mts';

const ROLES = ['production', 'test'];
const PERSISTENCE_KINDS = ['entity', 'data-access'];
const KINDS = ['function', 'class', 'const', 'type', 'interface', 'enum'];
const SCHEMA_DOCS = 'see "Facts schema" in docs/internals.md';
const PATH_RULE =
  'paths are project-relative with "/" separators, without "./", ".." or a trailing "/"';

function isName(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    isNonEmpty(fieldOf(value, 'name')) &&
    optional(isNonEmpty)(fieldOf(value, 'alias'))
  );
}

function isTree(value: unknown): boolean {
  return typeof value === 'object' && value !== null && isNonEmpty(fieldOf(value, 'kind'));
}

function isNames(value: unknown): boolean {
  return Array.isArray(value) && value.every(isName);
}

const OPTIONAL_PATH = optional(isRootOrPath);
const PATH_CHECKS = new Set<Check>([isProjectPath, isRootOrPath, OPTIONAL_PATH]);

const SHAPES: Readonly<Record<string, Readonly<Record<string, Check>>>> = {
  modules: {
    file: isProjectPath,
    role: oneOf(ROLES),
    entry: optional(isBoolean),
    publicNames: optional(isStrings),
    entryName: optional(isNonEmpty),
    compositionRoot: optional(isBoolean),
    persistence: optional(oneOf(PERSISTENCE_KINDS)),
    generated: optional(isBoolean),
    initializer: optional(isBoolean),
  },
  packages: { root: isRootOrPath, published: isBoolean },
  definitions: {
    file: isProjectPath,
    name: isNonEmpty,
    kind: oneOf(KINDS),
    line: isLine,
    exported: isBoolean,
    tokens: isStrings,
    untypedTokens: optional(isStrings),
    qualifier: optional(isNonEmpty),
    lines: optional(isLine),
    size: optional(isCount),
    literal: optional(isBoolean),
    usedLocally: optional(isBoolean),
    exportNames: optional(isStrings),
    key: optional(isString),
    text: optional(isString),
    entry: optional(isBoolean),
    overloads: optional(isBoolean),
    package: OPTIONAL_PATH,
  },
  imports: {
    from: isProjectPath,
    to: isProjectPath,
    names: isNames,
    reexport: optional(isBoolean),
    typeOnly: optional(isBoolean),
    conditional: optional(isBoolean),
    reference: optional(isBoolean),
    local: optional(isBoolean),
  },
  docComments: {
    file: isProjectPath,
    line: isLine,
    name: isNonEmpty,
    qualifier: optional(isNonEmpty),
    lines: isStrings,
    detailed: optional(isBoolean),
  },
  console: { file: isRootOrPath, test: isString, messages: isStrings },
  nearDuplicateUnits: {
    file: isProjectPath,
    name: isNonEmpty,
    start: isLine,
    end: isLine,
    tokens: isCount,
    tree: isTree,
  },
};

const DESIGN_LISTS: Readonly<Record<string, unknown>> = DESIGN_SHAPES;

const FACT_LISTS = [...Object.keys(SHAPES), ...Object.keys(DESIGN_SHAPES)];

type KnownCheck = (known: ReadonlySet<string>, file: unknown) => boolean;

function isModule(known: ReadonlySet<string>, file: unknown): boolean {
  return typeof file === 'string' && known.has(file);
}

function isModuleOrFolder(known: ReadonlySet<string>, file: unknown): boolean {
  return (
    file === '' ||
    (typeof file === 'string' &&
      (known.has(file) || [...known].some((module) => module.startsWith(`${file}/`))))
  );
}

const MODULE_REFERENCES: readonly (readonly [string, string, KnownCheck])[] = [
  ['imports', 'from', isModule],
  ['imports', 'to', isModule],
  ['definitions', 'file', isModule],
  ['docComments', 'file', isModule],
  ['nearDuplicateUnits', 'file', isModule],
  ['console', 'file', isModuleOrFolder],
];

const REFERENCE_NOUNS: Readonly<Record<string, string>> = {
  docComments: 'doc comment',
  console: 'console entry',
  nearDuplicateUnits: 'near-duplicate unit',
};

function itemProblem(list: string, item: unknown, index: number): string | undefined {
  if (Object.hasOwn(DESIGN_LISTS, list) && DESIGN_LISTS[list] !== undefined) {
    return designItemProblem(list, item, index);
  }
  if (!isRecord(item)) {
    return `facts.${list}[${String(index)}] must be an object`;
  }
  const found = Object.entries(SHAPES[list] ?? {}).find(([key, test]) => !test(item[key]));
  if (found === undefined) {
    return undefined;
  }
  const [field, check] = found;
  const present = Object.hasOwn(item, field) && item[field] !== undefined;
  const value = present ? JSON.stringify(item[field]) : 'missing';
  const hint = PATH_CHECKS.has(check) && isString(item[field]) ? `: ${PATH_RULE}` : '';
  return `facts.${list}[${String(index)}].${field} is ${value}${hint}`;
}

function listProblem(facts: Readonly<Record<string, unknown>>, list: string): string | undefined {
  const items = facts[list];
  if (items === undefined) {
    return undefined;
  }
  if (!Array.isArray(items)) {
    return `facts.${list} must be an array`;
  }
  return items
    .map((item, index) => itemProblem(list, item, index))
    .find((problem) => problem !== undefined);
}

function danglingReference({
  list,
  field,
  index,
  value,
}: {
  readonly list: string;
  readonly field: string;
  readonly index: number;
  readonly value: unknown;
}): string {
  const noun = REFERENCE_NOUNS[list] ?? list.slice(0, -1);
  const where = `facts.${list}[${String(index)}].${field} is ${JSON.stringify(value)}`;
  return `${where}, which is not in facts.modules: list that file in modules, or leave the ${noun} out`;
}

function referenceProblem(facts: Readonly<Record<string, unknown>>): string | undefined {
  if (!Array.isArray(facts['modules'])) {
    return undefined;
  }
  const known = new Set(
    listOf(facts['modules'])
      .map((module) => fieldOf(module, 'file'))
      .filter(isString),
  );
  const problems = MODULE_REFERENCES.map(([list, field, isKnown]) => {
    const items = listOf(facts[list]);
    const index = items.findIndex((item) => !isKnown(known, fieldOf(item, field)));
    return index === -1
      ? undefined
      : danglingReference({ list, field, index, value: fieldOf(items[index], field) });
  });
  return problems.find((problem) => problem !== undefined);
}

function assertFacts(facts: unknown): asserts facts is Facts {
  if (!isRecord(facts)) {
    throw new TypeError('facts must be a JSON object');
  }
  const problem =
    FACT_LISTS.map((list) => listProblem(facts, list)).find((found) => found !== undefined) ??
    referenceProblem(facts) ??
    designReferenceProblem(facts);
  if (problem !== undefined) {
    throw new TypeError(`${problem}; ${SCHEMA_DOCS}`);
  }
}

export function validateFacts(facts: unknown): Facts {
  assertFacts(facts);
  return facts;
}

function parsedFacts(file: string): unknown {
  const text = readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new SyntaxError(messageOf(error), { cause: error });
  }
}

export function readFactsFile(file: string): Facts {
  return validateFacts(parsedFacts(file));
}
