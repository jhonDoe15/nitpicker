import {
  fieldOf,
  listOf,
  numberOr,
  optionalText,
  textOf,
} from '../../../../shared/values/readers.mts';
import type {
  ClassFacts,
  FactsIndex,
  FileFacts,
  FunctionFacts,
  LambdaFacts,
  PropertyFacts,
} from './typed/fact-types.mts';

const START = 'start';
const FUNCTIONS = 'functions';

const FILE_KEYS = [
  'file',
  'lines',
  'classes',
  FUNCTIONS,
  'lambdas',
  'branching',
  'casts',
  'exhaustiveLastEntries',
];

function flag(entry: unknown, key: string): boolean {
  return fieldOf(entry, key) === true;
}

function count(entry: unknown, key: string): number {
  return numberOr(fieldOf(entry, key), Number.NaN);
}

function numbers(entry: unknown, key: string): number[] {
  return listOf(fieldOf(entry, key)).filter((value) => typeof value === 'number');
}

function propertyOf(entry: unknown): PropertyFacts {
  return {
    name: textOf(fieldOf(entry, 'name')),
    getter: flag(entry, 'getter'),
    setter: flag(entry, 'setter'),
    delegated: flag(entry, 'delegated'),
    start: count(entry, START),
    end: count(entry, 'end'),
  };
}

function classOf(entry: unknown): ClassFacts {
  return {
    name: textOf(fieldOf(entry, 'name')),
    kind: textOf(fieldOf(entry, 'kind')),
    start: count(entry, START),
    headerEnd: count(entry, 'headerEnd'),
    init: flag(entry, 'init'),
    functions: listOf(fieldOf(entry, FUNCTIONS)).map(textOf),
    properties: listOf(fieldOf(entry, 'properties')).map(propertyOf),
  };
}

function functionOf(entry: unknown): FunctionFacts {
  return {
    class: textOf(fieldOf(entry, 'class')),
    name: textOf(fieldOf(entry, 'name')),
    jvmName: optionalText(fieldOf(entry, 'jvmName')),
    staticIn: optionalText(fieldOf(entry, 'staticIn')),
    suspend: flag(entry, 'suspend'),
    inline: flag(entry, 'inline'),
    returnsUnit: flag(entry, 'returnsUnit'),
    inlineCalls: listOf(fieldOf(entry, 'inlineCalls')),
    start: count(entry, START),
    end: count(entry, 'end'),
  };
}

function lambdaOf(entry: unknown): LambdaFacts {
  return {
    start: count(entry, START),
    end: count(entry, 'end'),
    callee: textOf(fieldOf(entry, 'callee')),
    returnLines: numbers(entry, 'returnLines'),
    valueLines: numbers(entry, 'valueLines'),
    discarded: flag(entry, 'discarded'),
    unitCallee: flag(entry, 'unitCallee'),
    projectCallee: flag(entry, 'projectCallee'),
  };
}

export function indexMutationFacts(facts: unknown): FactsIndex {
  const entries = fieldOf(facts, 'files');
  if (!Array.isArray(entries)) {
    throw new TypeError('the report has no "files" list');
  }
  const files = new Map<string, FileFacts>();
  for (const file of entries) {
    const missing = FILE_KEYS.filter((key) => fieldOf(file, key) === undefined);
    if (missing.length > 0) {
      const name = fieldOf(file, 'file') ?? 'a file';
      throw new TypeError(`the entry of ${textOf(name)} lacks ${missing.join(', ')}`);
    }
    files.set(textOf(fieldOf(file, 'file')), indexFile(file));
  }
  return { files };
}

function indexFile(file: unknown): FileFacts {
  return {
    lines: count(file, 'lines'),
    classes: new Map(
      listOf(fieldOf(file, 'classes')).map((entry) => [
        textOf(fieldOf(entry, 'name')),
        classOf(entry),
      ]),
    ),
    functions: listOf(fieldOf(file, FUNCTIONS)).map(functionOf),
    lambdas: listOf(fieldOf(file, 'lambdas')).map(lambdaOf),
    branching: new Set(numbers(file, 'branching')),
    casts: new Set(numbers(file, 'casts')),
    exhaustiveLastEntries: new Set(numbers(file, 'exhaustiveLastEntries')),
  };
}

export function declaredClassNames(index: FactsIndex): Set<string> {
  return new Set([...index.files.values()].flatMap((file) => [...file.classes.keys()]));
}
