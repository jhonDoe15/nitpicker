import type { GuardedCase } from './guarded-case.mts';

const FIND = '@typescript-eslint/prefer-find';
const AWAIT = '@typescript-eslint/require-await';
const PRIVATE = 'no-unused-private-class-members';
const HELPER = 'async function one(): Promise<number> {\n  return 1;\n}\n\n';
const UNASYNC = ['async function one(): Promise<number>', 'function one(): number'] as const;

function counter(member: string): string {
  return `declare function register(): number;\n\nexport class Counter {\n  ${member}\n}\n`;
}

export const EFFECT_CASES: readonly GuardedCase[] = [
  {
    rule: FIND,
    input:
      'export function firstEven(values: readonly number[], log: number[]): number | undefined {\n  return values.filter((value) => {\n    log.push(value);\n    return value % 2 === 0;\n  })[0];\n}\n',
  },
  {
    rule: FIND,
    input:
      'function isWanted(name: string): boolean {\n  return name.length > 2;\n}\n\nexport function firstWanted(names: readonly string[]): string | undefined {\n  return names.filter((name) => isWanted(name))[0];\n}\n',
  },
  {
    rule: FIND,
    input:
      "export function firstLong(names: readonly string[]): string | undefined {\n  return names.filter((name) => name.startsWith('a') && name.length > 2).at(0);\n}\n",
    selected: [
      "names.filter((name) => name.startsWith('a') && name.length > 2).at(0)",
      "names.find((name) => name.startsWith('a') && name.length > 2)",
    ],
  },
  {
    rule: FIND,
    input:
      'export function firstSet(names: readonly (string | undefined)[]): string | undefined {\n  return names.filter(Boolean)[0];\n}\n',
    selected: ['names.filter(Boolean)[0]', 'names.find(Boolean)'],
  },
  { rule: AWAIT, input: 'export async function one(): Promise<number> {\n  return 1;\n}\n' },
  {
    rule: AWAIT,
    input: `${HELPER}export async function both(): Promise<number> {\n  const pending = one();\n  return (await pending) + 1;\n}\n`,
  },
  {
    rule: AWAIT,
    input:
      "async function fail(): Promise<number> {\n  throw new Error('boom');\n}\n\nexport async function run(): Promise<number> {\n  return await fail();\n}\n",
  },
  {
    rule: AWAIT,
    input: `${HELPER}export async function wrapped(): Promise<number> {\n  try {\n    return one();\n  } catch {\n    return 0;\n  }\n}\n`,
  },
  {
    rule: AWAIT,
    input: `${HELPER}export async function two(): Promise<number> {\n  return (await one()) + 1;\n}\n\nexport async function three(): Promise<number> {\n  return one();\n}\n`,
    selected: UNASYNC,
  },
  { rule: PRIVATE, input: counter('readonly #id = register();') },
  { rule: PRIVATE, input: counter('readonly #created = new Date();') },
  {
    rule: PRIVATE,
    input: counter("readonly #label = 'counter';"),
    selected: ["{\n  readonly #label = 'counter';\n}", '{}'],
  },
  {
    rule: PRIVATE,
    input: counter('readonly #next = (): number => register();'),
    selected: ['{\n  readonly #next = (): number => register();\n}', '{}'],
  },
];
