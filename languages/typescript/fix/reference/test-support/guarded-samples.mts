export type GuardedSample = {
  readonly rule: string;
  readonly path: string;
  readonly input: string;
  readonly plain: string;
  readonly selected: string;
};

const GENERIC_HAS =
  'export function has<T>(values: readonly T[], value: T): boolean {\n  return values.indexOf(value) !== -1;\n}\n';
const NUMBER_HAS =
  'export function has(values: readonly number[], value: number): boolean {\n  return values.indexOf(value) === -1;\n}\n';
const HOLE_HAS =
  'export function hasHole(values: readonly (string | undefined)[]): boolean {\n  return values.indexOf(undefined) >= 0;\n}\n';
const STRING_HAS =
  'export function has(text: string, part: string): boolean {\n  return text.indexOf(part) !== -1;\n}\n';
const LITERAL_HAS =
  "export function has(modes: readonly ('a' | 'b')[], mode: 'a' | 'b'): boolean {\n  return modes.indexOf(mode) !== -1;\n}\n";
const OBJECT_HAS =
  'type Item = { readonly id: string };\n\nexport function has(items: readonly (Item | null)[], item: Item | null): boolean {\n  return items.indexOf(item) !== -1;\n}\n';

const KEYED_HAS = GENERIC_HAS.replace('has<T>', 'has<T extends string>');

const CAST_DEFAULT =
  'type Settings = { readonly retries: number };\n\nexport function retries({ retries = 3 }: Settings): number {\n  return retries;\n}\n\nexport function fromJson(text: string): number {\n  return retries(JSON.parse(text) as Settings);\n}\n';

const LOGGED_FIND =
  'export function firstEven(values: readonly number[], log: number[]): number | undefined {\n  return values.filter((value) => {\n    log.push(value);\n    return value % 2 === 0;\n  })[0];\n}\n';
const OUTER_FIND =
  'function isWanted(name: string): boolean {\n  return name.length > 2;\n}\n\nexport function firstWanted(names: readonly string[]): string | undefined {\n  return names.filter((name) => isWanted(name))[0];\n}\n';
const PREDICATE_FIND =
  "export function firstLong(names: readonly string[]): string | undefined {\n  return names.filter((name) => name.startsWith('a') && name.length > 2).at(0);\n}\n";
const BOOLEAN_FIND =
  'export function firstSet(names: readonly (string | undefined)[]): string | undefined {\n  return names.filter(Boolean)[0];\n}\n';

export const GUARDED_SAMPLES: readonly GuardedSample[] = [
  {
    rule: '@typescript-eslint/prefer-includes',
    path: 'src/main/samples/g00.ts',
    input: GENERIC_HAS,
    plain: GENERIC_HAS,
    selected: GENERIC_HAS.replace('values.indexOf(value) !== -1', 'values.includes(value)'),
  },
  {
    rule: '@typescript-eslint/prefer-includes',
    path: 'src/main/samples/g01.ts',
    input: NUMBER_HAS,
    plain: NUMBER_HAS,
    selected: NUMBER_HAS.replace('values.indexOf(value) === -1', '!values.includes(value)'),
  },
  {
    rule: '@typescript-eslint/prefer-includes',
    path: 'src/main/samples/g02.ts',
    input: HOLE_HAS,
    plain: HOLE_HAS,
    selected: HOLE_HAS.replace('values.indexOf(undefined) >= 0', 'values.includes(undefined)'),
  },
  {
    rule: '@typescript-eslint/prefer-includes',
    path: 'src/main/samples/g03.ts',
    input: STRING_HAS,
    plain: STRING_HAS.replace('text.indexOf(part) !== -1', 'text.includes(part)'),
    selected: STRING_HAS.replace('text.indexOf(part) !== -1', 'text.includes(part)'),
  },
  {
    rule: '@typescript-eslint/prefer-includes',
    path: 'src/main/samples/g04.ts',
    input: LITERAL_HAS,
    plain: LITERAL_HAS.replace('modes.indexOf(mode) !== -1', 'modes.includes(mode)'),
    selected: LITERAL_HAS.replace('modes.indexOf(mode) !== -1', 'modes.includes(mode)'),
  },
  {
    rule: '@typescript-eslint/prefer-includes',
    path: 'src/main/samples/g05.ts',
    input: OBJECT_HAS,
    plain: OBJECT_HAS.replace('items.indexOf(item) !== -1', 'items.includes(item)'),
    selected: OBJECT_HAS.replace('items.indexOf(item) !== -1', 'items.includes(item)'),
  },
  {
    rule: '@typescript-eslint/prefer-includes',
    path: 'src/main/samples/g06.ts',
    input: KEYED_HAS,
    plain: KEYED_HAS.replace('values.indexOf(value) !== -1', 'values.includes(value)'),
    selected: KEYED_HAS.replace('values.indexOf(value) !== -1', 'values.includes(value)'),
  },
  {
    rule: '@typescript-eslint/no-useless-default-assignment',
    path: 'src/main/samples/g07.ts',
    input: CAST_DEFAULT,
    plain: CAST_DEFAULT,
    selected: CAST_DEFAULT.replace('{ retries = 3 }', '{ retries }'),
  },
  {
    rule: '@typescript-eslint/prefer-find',
    path: 'src/main/samples/g08.ts',
    input: LOGGED_FIND,
    plain: LOGGED_FIND,
    selected: LOGGED_FIND,
  },
  {
    rule: '@typescript-eslint/prefer-find',
    path: 'src/main/samples/g09.ts',
    input: OUTER_FIND,
    plain: OUTER_FIND,
    selected: OUTER_FIND,
  },
  {
    rule: '@typescript-eslint/prefer-find',
    path: 'src/main/samples/g10.ts',
    input: PREDICATE_FIND,
    plain: PREDICATE_FIND,
    selected: PREDICATE_FIND.replace('.filter(', '.find(').replace(').at(0);', ');'),
  },
  {
    rule: '@typescript-eslint/prefer-find',
    path: 'src/main/samples/g11.ts',
    input: BOOLEAN_FIND,
    plain: BOOLEAN_FIND,
    selected: BOOLEAN_FIND.replace('names.filter(Boolean)[0]', 'names.find(Boolean)'),
  },
];
