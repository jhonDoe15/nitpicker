import loggingConfig from '../eslint-config/logging.mjs';
import strictConfig from '../eslint-config/strict.mjs';

function strictCase([name, banned, allowed]) {
  return { name, config: strictConfig, filename: 'src/fixture.ts', banned, allowed };
}

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
  ].map(strictCase),
];
