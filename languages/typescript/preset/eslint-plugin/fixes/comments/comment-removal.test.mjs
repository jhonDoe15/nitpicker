import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from '../../rules/modules/no-comments.mjs';

const tester = typescriptRuleTester();
const comment = [{ messageId: 'comment' }];

tester.run('no-comments fixes', rule, {
  valid: [],
  invalid: [
    {
      code: '// note\nexport const a = 1;\n',
      errors: comment,
      output: 'export const a = 1;\n',
    },
    {
      code: 'export const a = 1;\n  // note\nexport const b = 2;\n',
      errors: comment,
      output: 'export const a = 1;\nexport const b = 2;\n',
    },
    {
      code: 'export const a = 1;\r\n// note\r\nexport const b = 2;\r\n',
      errors: comment,
      output: 'export const a = 1;\r\nexport const b = 2;\r\n',
    },
    {
      code: 'export const a = 1; // note\nexport const b = 2;\n',
      errors: comment,
      output: 'export const a = 1;\nexport const b = 2;\n',
    },
    {
      code: 'export const a = 1; /* note */',
      errors: comment,
      output: 'export const a = 1;',
    },
    {
      code: 'const a = /* note */ 1;\n',
      errors: comment,
      output: 'const a = 1;\n',
    },
    {
      code: 'run(/* note */ a);\n',
      errors: comment,
      output: 'run(a);\n',
    },
    {
      code: 'export const a = 1;\nexport const b = a+/* note */+a;\nexport const c = a- /* x */-a;\n',
      errors: [{ messageId: 'comment' }, { messageId: 'comment' }],
      output: 'export const a = 1;\nexport const b = a+ +a;\nexport const c = a- -a;\n',
    },
    {
      code: 'function f() { return/* note */a; }\n',
      errors: comment,
      output: 'function f() { return a; }\n',
    },
    {
      code: '/*\n * note\n * more\n */\nexport const a = 1;\n',
      errors: comment,
      output: 'export const a = 1;\n',
    },
    {
      code: '// @ts-ignore\nexport const a: number = 1;\n',
      errors: [{ messageId: 'typescriptSuppression' }],
      output: 'export const a: number = 1;\n',
    },
    {
      code: 'export const a = 1; // eslint-disable-line no-console\n',
      errors: [{ messageId: 'eslintSuppression' }],
      output: 'export const a = 1;\n',
    },
    {
      code: '/** Notes. */\nfunction local() {}\nexport const a = local;\n',
      errors: [{ messageId: 'internalDocComment' }],
      output: 'function local() {}\nexport const a = local;\n',
    },
    {
      code: 'function f() { return /* first\nsecond */ 1; }\n',
      errors: comment,
      output: null,
    },
    {
      filename: 'view.tsx',
      code: 'export const view = <div>{/* note */}</div>;\n',
      errors: comment,
      output: null,
    },
    {
      code: '/** Gets the user name. */\nexport function getUserName() { return 1; }\n',
      options: [{ jsdocTypes: true }],
      errors: [{ messageId: 'jsdocProse' }],
      output: null,
    },
  ],
});
