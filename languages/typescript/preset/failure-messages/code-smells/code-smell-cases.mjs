import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import strictSyntaxConfig, { strictProductionRules } from '../../eslint-config/strict.mjs';
import { codeSmellProductionRules } from '../../eslint-config/code-smells/code-smell-rules.mjs';

const codeSmellConfig = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: { ...strictProductionRules, ...codeSmellProductionRules },
  },
];
const FIXTURE = 'src/fixture.ts';
const GENERIC_FILE = 'src/utils.ts';
const EXCEPTION = 'exception for nitpicker/';

function codeSmellCase([name, banned, allowed, filename = FIXTURE]) {
  return { name: `code smells: ${name}`, config: codeSmellConfig, filename, banned, allowed };
}

const duplicate = "use('pending'); use('pending'); use('pending');";
const secret = "const password = 'hunter2';";
const flag = 'export function render(loud: boolean) { return loud; }';
const loop = 'for (const id of ids) { await repository.findById(id); }';

export const codeSmellFailureMessageCases = [
  ...[
    ['duplicated string names a constant', duplicate, 'const NAME'],
    ['duplicated string names the exception', duplicate, EXCEPTION],
    ['hardcoded secret names the environment', secret, 'process.env'],
    ['hardcoded secret names the exception', secret, EXCEPTION],
    ['logged secret names masking', 'logger.info({ token });', 'masked tail'],
    ['boolean flag names the options object', flag, 'options object'],
    ['boolean flag names the exception', flag, EXCEPTION],
    ['I/O in a loop names the batched call', loop, 'findByIds'],
    ['I/O in a loop names the exception', loop, EXCEPTION],
    [
      'accumulator spread names Object.fromEntries',
      'xs.reduce((acc, x) => ({ ...acc, [x.id]: x }), {});',
      'Object.fromEntries',
    ],
    ['generic file name names the exception', 'export const a = 1;', EXCEPTION, GENERIC_FILE],
    [
      'generic file name names the shared folder',
      'export const a = 1;',
      'shared folder',
      GENERIC_FILE,
    ],
    ['generic type name names its job', 'export type OrderManager = { a: 1 };', 'instead of Utils'],
  ].map(codeSmellCase),
  {
    name: 'code smells: TODO without an issue names the reference form',
    config: strictSyntaxConfig,
    filename: FIXTURE,
    banned: '/** TODO: later */\nexport const a = 1;',
    allowed: 'TODO(#123)',
  },
  {
    name: 'code smells: commented-out code names deletion',
    config: strictSyntaxConfig,
    filename: FIXTURE,
    banned: '/**\n * const old = load();\n */\nexport const a = 1;',
    allowed: 'Delete the commented-out code',
  },
];
