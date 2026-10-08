import path from 'node:path';
import loggingConfig from '../eslint-config/logging.mjs';
import strictSyntaxConfig, { strictConfig } from '../eslint-config/strict.mjs';
import { domainFailureMessageCases } from './domain-cases.mjs';
import strictDomainConfig from '../eslint-config/strict-domain.mjs';

function strictCase([name, banned, allowed]) {
  return { name, config: strictSyntaxConfig, filename: 'src/fixture.ts', banned, allowed };
}

const typedStrictConfig = strictConfig({
  projectService: { allowDefaultProject: ['src/*.ts'] },
  tsconfigRootDir: process.cwd(),
});

// Add one entry per banned form. `config` is any ESLint flat config array; `banned` is a fixture
// that must fail; `allowed` is the wording the message must use to name the allowed form.
export const failureMessageCases = [
  {
    name: 'console call names the application logger',
    config: loggingConfig,
    filename: 'src/service.ts',
    banned: 'console.log("started");',
    allowed: 'application logger',
  },
  ...[
    ['as assertion names narrowing', 'const value = input as string;', 'narrow'],
    ['angle-bracket assertion names narrowing', 'const value = <string>input;', 'narrow'],
    ['any names unknown', 'export function read(input: any) { return input; }', '`unknown`'],
    ['non-null assertion names the undefined check', 'const value = map.get(key)!;', 'undefined'],
    ['null literal names undefined', 'const value = null;', '`undefined`'],
    ['null return names undefined', 'function find() { return null; }', '`undefined`'],
    ['null type names undefined', 'type Maybe = string | null;', '`undefined`'],
    [
      'ts-ignore names fixing the type error',
      '// @ts-ignore\nconst value: number = "a";',
      'fix the type error',
    ],
    [
      'ts-expect-error names fixing the type error',
      '// @ts-expect-error\nconst value: number = "a";',
      'fix the type error',
    ],
    [
      'ts-nocheck names fixing the type error',
      '// @ts-nocheck\nconst value = 1;',
      'fix the type error',
    ],
    [
      'eslint-disable names the config exception',
      '// eslint-disable-next-line no-console\nconst value = 1;',
      'nitpicker config file',
    ],
    [
      'line comment names descriptive code',
      '// increments the counter\nconst value = 1;',
      'descriptive identifier',
    ],
    [
      'block comment names descriptive code',
      '/* explains */\nconst value = 1;',
      'descriptive identifier',
    ],
    ['interface names type', 'interface Shape { size: number }', '`type`'],
    [
      'enum names a union of string literals',
      'enum Mode { Read, Write }',
      'union of string literals',
    ],
    [
      'namespace names a module with named exports',
      'namespace Tools { export const a = 1; }',
      'named exports',
    ],
    ['class names Error subclasses', 'class Service { run() {} }', '`Error` subclasses'],
    [
      'class expression names Error subclasses',
      'const Service = class { run() {} };',
      '`Error` subclasses',
    ],
    ['arrow function names the function keyword', 'const read = () => 1;', '`function` keyword'],
    [
      'function expression names the function keyword',
      'const read = function () { return 1; };',
      '`function` keyword',
    ],
    [
      'default export names a named export',
      'export default function read() { return 1; }',
      'named export',
    ],
    [
      'default specifier names a named export',
      'const read = 1; export { read as default };',
      'named export',
    ],
    [
      'else after return names early return',
      'function read(a) { if (a) { return 1; } else { return 2; } }',
      'return early',
    ],
    [
      'else-if after return names early return',
      'function read(a) { if (a) { return 1; } else if (a > 1) { return 2; } return 3; }',
      'return early',
    ],
    ['nested ternary names early returns', 'const value = a ? 1 : b ? 2 : 3;', 'early returns'],
  ].map(strictCase),
  {
    name: 'non-exhaustive switch names exhaustive handling',
    config: typedStrictConfig,
    filename: path.resolve('src/fixture.ts'),
    banned:
      "type Shape = { kind: 'a' } | { kind: 'b' };\nexport function read(shape: Shape) { switch (shape.kind) { case 'a': return 1; } return 0; }",
    allowed: 'exhaustive',
  },
  ...domainFailureMessageCases,
  {
    name: 'domain recursion names flatMap',
    config: strictDomainConfig,
    filename: 'src/main/features/billing/domain/total.ts',
    banned: 'function total(items) { return items.length === 0 ? 0 : 1 + total(items.slice(1)); }',
    allowed: 'flatMap',
  },
  {
    name: 'domain arrow recursion names flatMap',
    config: strictDomainConfig,
    filename: 'src/main/features/billing/domain/walk.ts',
    banned: 'const walk = (node) => node.children.flatMap((child) => walk(child));',
    allowed: 'flatMap',
  },
  {
    name: 'domain throw names the discriminated-union result',
    config: strictDomainConfig,
    filename: 'src/main/features/billing/domain/parse.ts',
    banned: 'function parse(input) { if (!input) { throw new Error("empty"); } return input; }',
    allowed: 'discriminated-union failure result',
  },
];
