import type { GuardedCase } from './guarded-case.mts';

const INCLUDES = '@typescript-eslint/prefer-includes';
const GENERIC_HAS =
  'export function has<T>(values: readonly T[], value: T): boolean {\n  return values.indexOf(value) !== -1;\n}\n';
const FOUND = ['values.indexOf(value) !== -1', 'values.includes(value)'] as const;

export const VALUE_CASES: readonly GuardedCase[] = [
  { rule: INCLUDES, input: GENERIC_HAS, selected: FOUND },
  {
    rule: INCLUDES,
    input:
      'export function has(values: readonly number[], value: number): boolean {\n  return values.indexOf(value) === -1;\n}\n',
    selected: ['values.indexOf(value) === -1', '!values.includes(value)'],
  },
  {
    rule: INCLUDES,
    input:
      'export function hasHole(values: readonly (string | undefined)[]): boolean {\n  return values.indexOf(undefined) >= 0;\n}\n',
    selected: ['values.indexOf(undefined) >= 0', 'values.includes(undefined)'],
  },
  {
    rule: INCLUDES,
    input:
      'export function has(text: string, part: string): boolean {\n  return text.indexOf(part) !== -1;\n}\n',
    fixed: ['text.indexOf(part) !== -1', 'text.includes(part)'],
  },
  {
    rule: INCLUDES,
    input:
      "export function has(modes: readonly ('a' | 'b')[], mode: 'a' | 'b'): boolean {\n  return modes.indexOf(mode) !== -1;\n}\n",
    fixed: ['modes.indexOf(mode) !== -1', 'modes.includes(mode)'],
  },
  {
    rule: INCLUDES,
    input:
      'type Item = { readonly id: string };\n\nexport function has(items: readonly (Item | null)[], item: Item | null): boolean {\n  return items.indexOf(item) !== -1;\n}\n',
    fixed: ['items.indexOf(item) !== -1', 'items.includes(item)'],
  },
  { rule: INCLUDES, input: GENERIC_HAS.replace('has<T>', 'has<T extends string>'), fixed: FOUND },
  {
    rule: '@typescript-eslint/no-useless-default-assignment',
    input:
      'type Settings = { readonly retries: number };\n\nexport function retries({ retries = 3 }: Settings): number {\n  return retries;\n}\n\nexport function fromJson(text: string): number {\n  return retries(JSON.parse(text) as Settings);\n}\n',
    selected: ['{ retries = 3 }', '{ retries }'],
  },
];
