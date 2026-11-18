export type AutomaticSample = {
  readonly path: string;
  readonly input: string;
  readonly output: string;
};

export const AUTOMATIC_SAMPLES: Readonly<Record<string, AutomaticSample>> = {
  'nitpicker/simpler-boolean-logic': {
    path: 'src/main/samples/s46.ts',
    input:
      'export function neither(first: boolean, second: boolean): boolean {\n  return !first && !second;\n}\n',
    output:
      'export function neither(first: boolean, second: boolean): boolean {\n  return !(first || second);\n}\n',
  },
  'no-duplicate-imports': {
    path: 'src/main/samples/s44.ts',
    input:
      "import { join } from 'node:path';\nimport { basename } from 'node:path';\n\nexport function named(folder: string): string {\n  return basename(join(folder, 'a'));\n}\n",
    output:
      "import { join, basename } from 'node:path';\n\nexport function named(folder: string): string {\n  return basename(join(folder, 'a'));\n}\n",
  },
  'no-useless-catch': {
    path: 'src/main/samples/s43.ts',
    input:
      'export function parsed(text: string): unknown {\n  try {\n    return JSON.parse(text);\n  } catch (error) {\n    throw error;\n  }\n}\n',
    output: 'export function parsed(text: string): unknown {\n  return JSON.parse(text);\n}\n',
  },
  'no-useless-concat': {
    path: 'src/main/samples/s42.ts',
    input: "export const greeting = 'hello ' + 'world';\n",
    output: "export const greeting = 'hello world';\n",
  },
  'no-useless-escape': {
    path: 'src/main/samples/s41.ts',
    input: "export const label = 'a\\-b';\n",
    output: "export const label = 'a-b';\n",
  },
  'no-empty-static-block': {
    path: 'src/main/samples/s40.ts',
    input: 'export class Empty {\n  static {}\n\n  readonly size = 1;\n}\n',
    output: 'export class Empty {\n  readonly size = 1;\n}\n',
  },
  '@typescript-eslint/no-duplicate-type-constituents': {
    path: 'src/main/samples/s00.ts',
    input: 'export type Id = string | string;\n',
    output: 'export type Id = string;\n',
  },
  '@typescript-eslint/no-extra-non-null-assertion': {
    path: 'src/main/samples/s01.ts',
    input:
      'export function first(values: readonly (string | undefined)[]): string {\n  const value = values[0];\n  return value!!;\n}\n',
    output:
      'export function first(values: readonly (string | undefined)[]): string {\n  const value = values[0];\n  return value!;\n}\n',
  },
  '@typescript-eslint/no-meaningless-void-operator': {
    path: 'src/main/samples/s02.ts',
    input:
      "function note(log: string[]): void {\n  log.push('x');\n}\n\nexport function run(log: string[]): void {\n  void note(log);\n}\n",
    output:
      "function note(log: string[]): void {\n  log.push('x');\n}\n\nexport function run(log: string[]): void {\n  note(log);\n}\n",
  },
  '@typescript-eslint/no-unnecessary-boolean-literal-compare': {
    path: 'src/main/samples/s03.ts',
    input:
      "export function on(flag: boolean): string {\n  return flag === true ? 'on' : 'off';\n}\n",
    output: "export function on(flag: boolean): string {\n  return flag ? 'on' : 'off';\n}\n",
  },
  '@typescript-eslint/no-unnecessary-template-expression': {
    path: 'src/main/samples/s04.ts',
    input: 'export function label(name: string): string {\n  return `${name}`;\n}\n',
    output: 'export function label(name: string): string {\n  return name;\n}\n',
  },
  '@typescript-eslint/no-unnecessary-type-arguments': {
    path: 'src/main/samples/s05.ts',
    input:
      "export function make(): Set<string> {\n  return new Set<string>(['a']);\n}\n\nexport function wrap<T = string>(value: T): T {\n  return value;\n}\n\nexport const wrapped = wrap<string>('a');\n",
    output:
      "export function make(): Set<string> {\n  return new Set<string>(['a']);\n}\n\nexport function wrap<T = string>(value: T): T {\n  return value;\n}\n\nexport const wrapped = wrap('a');\n",
  },
  '@typescript-eslint/no-unnecessary-type-assertion': {
    path: 'src/main/samples/s06.ts',
    input:
      'export function length(text: string): number {\n  const value = text as string;\n  return value.length;\n}\n',
    output:
      'export function length(text: string): number {\n  const value = text;\n  return value.length;\n}\n',
  },
  '@typescript-eslint/no-unnecessary-type-constraint': {
    path: 'src/main/samples/s07.ts',
    input: 'export function same<T extends unknown>(value: T): T {\n  return value;\n}\n',
    output: 'export function same<T>(value: T): T {\n  return value;\n}\n',
  },
  '@typescript-eslint/no-useless-constructor': {
    path: 'src/main/samples/s08.ts',
    input:
      'class Base {\n  public readonly size: number;\n  public constructor(size: number) {\n    this.size = size;\n  }\n}\n\nexport class Sized extends Base {\n  constructor(size: number) {\n    super(size);\n  }\n}\n',
    output:
      'class Base {\n  public readonly size: number;\n  public constructor(size: number) {\n    this.size = size;\n  }\n}\n\nexport class Sized extends Base {}\n',
  },
  '@typescript-eslint/no-wrapper-object-types': {
    path: 'src/main/samples/s09.ts',
    input: 'export function upper(text: String): string {\n  return text.toUpperCase();\n}\n',
    output: 'export function upper(text: string): string {\n  return text.toUpperCase();\n}\n',
  },
  '@typescript-eslint/prefer-as-const': {
    path: 'src/main/samples/s10.ts',
    input: "export const mode = 'fast' as 'fast';\n",
    output: "export const mode = 'fast';\n",
  },
  '@typescript-eslint/prefer-reduce-type-parameter': {
    path: 'src/main/samples/s12.ts',
    input:
      'export function counts(words: readonly string[]): Record<string, number> {\n  return words.reduce(\n    (all, word) => ({ ...all, [word]: (all[word] ?? 0) + 1 }),\n    {} as Record<string, number>,\n  );\n}\n',
    output:
      'export function counts(words: readonly string[]): Record<string, number> {\n  return words.reduce<Record<string, number>>(\n    (all, word) => ({ ...all, [word]: (all[word] ?? 0) + 1 }),\n    {},\n  );\n}\n',
  },
  '@typescript-eslint/prefer-return-this-type': {
    path: 'src/main/samples/s13.ts',
    input:
      'export class Chain {\n  private readonly parts: string[] = [];\n\n  public add(part: string): Chain {\n    this.parts.push(part);\n    return this;\n  }\n}\n',
    output:
      'export class Chain {\n  private readonly parts: string[] = [];\n\n  public add(part: string): this {\n    this.parts.push(part);\n    return this;\n  }\n}\n',
  },
  'no-extra-boolean-cast': {
    path: 'src/main/samples/s14.ts',
    input:
      "export function present(value: string | undefined): string {\n  if (!!value) {\n    return value;\n  }\n  return 'none';\n}\n",
    output:
      "export function present(value: string | undefined): string {\n  if (value) {\n    return value;\n  }\n  return 'none';\n}\n",
  },
  'no-unused-labels': {
    path: 'src/main/samples/s15.ts',
    input:
      'export function total(values: readonly number[]): number {\n  let sum = 0;\n  outer: for (const value of values) {\n    sum += value;\n  }\n  return sum;\n}\n',
    output:
      'export function total(values: readonly number[]): number {\n  let sum = 0;\n  for (const value of values) {\n    sum += value;\n  }\n  return sum;\n}\n',
  },
  'no-useless-return': {
    path: 'src/main/samples/s16.ts',
    input: "export function record(log: string[]): void {\n  log.push('done');\n  return;\n}\n",
    output: "export function record(log: string[]): void {\n  log.push('done');\n}\n",
  },
  'regexp/no-dupe-characters-character-class': {
    path: 'src/main/samples/s17.ts',
    input: 'export const letters = /[aa]/u;\n',
    output: 'export const letters = /a/u;\n',
  },
  'regexp/no-extra-lookaround-assertions': {
    path: 'src/main/samples/s18.ts',
    input: 'export const words = /a(?=b(?=c))/u;\n',
    output: 'export const words = /a(?=bc)/u;\n',
  },
  'regexp/no-trivially-nested-assertion': {
    path: 'src/main/samples/s19.ts',
    input: 'export const start = /(?=^)a/u;\n',
    output: 'export const start = /^a/u;\n',
  },
  'regexp/no-trivially-nested-quantifier': {
    path: 'src/main/samples/s20.ts',
    input: 'export const runs = /(?:a+)+/u;\n',
    output: 'export const runs = /a+/u;\n',
  },
  'regexp/no-useless-character-class': {
    path: 'src/main/samples/s21.ts',
    input: 'export const dot = /[.]/u;\n',
    output: 'export const dot = /\\./u;\n',
  },
  'regexp/no-useless-flag': {
    path: 'src/main/samples/s22.ts',
    input: "export const found = 'a'.search(/a/gu);\n",
    output: "export const found = 'a'.search(/a/u);\n",
  },
  'regexp/no-useless-lazy': {
    path: 'src/main/samples/s23.ts',
    input: 'export const one = /a{1}?/u;\n',
    output: 'export const one = /a/u;\n',
  },
  'regexp/no-useless-non-capturing-group': {
    path: 'src/main/samples/s24.ts',
    input: 'export const grouped = /(?:a)b/u;\n',
    output: 'export const grouped = /ab/u;\n',
  },
  'regexp/no-useless-quantifier': {
    path: 'src/main/samples/s25.ts',
    input: 'export const single = /a{1}/u;\n',
    output: 'export const single = /a/u;\n',
  },
  'regexp/no-useless-range': {
    path: 'src/main/samples/s26.ts',
    input: 'export const range = /[a-a]/u;\n',
    output: 'export const range = /a/u;\n',
  },
  'regexp/no-useless-set-operand': {
    path: 'src/main/samples/s27.ts',
    input: 'export const set = /[\\w&&\\d]/v;\n',
    output: 'export const set = /\\d/v;\n',
  },
  'regexp/no-useless-string-literal': {
    path: 'src/main/samples/s28.ts',
    input: 'export const literal = /[\\q{a}]/v;\n',
    output: 'export const literal = /a/v;\n',
  },
  'regexp/no-useless-two-nums-quantifier': {
    path: 'src/main/samples/s29.ts',
    input: 'export const twice = /a{2,2}/u;\n',
    output: 'export const twice = /a{2}/u;\n',
  },
  'regexp/prefer-predefined-assertion': {
    path: 'src/main/samples/s30.ts',
    input: 'export const boundary = /a(?!\\w)/u;\n',
    output: 'export const boundary = /a\\b/u;\n',
  },
  'regexp/simplify-set-operations': {
    path: 'src/main/samples/s31.ts',
    input: 'export const set = /[[^\\d]&&\\w]/v;\n',
    output: 'export const set = /[\\w--\\d]/v;\n',
  },
  'nitpicker/no-mutating-method-in-domain': {
    path: 'src/main/features/orders/domain/mutating.ts',
    input:
      "export function sortedNames(names: readonly string[]): readonly string[] {\n  return [...names]['sort']();\n}\n",
    output:
      "export function sortedNames(names: readonly string[]): readonly string[] {\n  return [...names]['toSorted']();\n}\n",
  },
};
