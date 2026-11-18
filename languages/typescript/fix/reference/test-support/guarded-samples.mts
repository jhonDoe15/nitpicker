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
];
