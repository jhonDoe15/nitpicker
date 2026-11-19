import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-incomplete-escaping.mts';

const tester = typescriptRuleTester();

function flagged(code: string, messageId = 'escapeBackslash') {
  return { code, errors: [{ messageId }] };
}

tester.run('no-incomplete-escaping', rule, {
  valid: [
    { code: 'export const q = value.replace(/(?<!\\\\)"/g, \'\\\\"\');' },
    { code: 'export const q = value.replace(/>/g, "\\\\>");' },
    { code: `export const q = \`"\${value.replace(/[\\\\"]/g, (c) => \`\\\\\${c}\`)}"\`;` },
    { code: 'export const q = value.replace(/[\\\\"]/g, "\\\\$&");' },
    { code: 'export const q = value.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, \'\\\\"\');' },
    { code: 'export const r = text.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");' },
    { code: 'export const q = JSON.stringify(value);' },
    { code: 'export const q = value.replace(/"/g, "&quot;");' },
    { code: `export const q = value.replace(/"/g, (c) => \`\\\\\${c}\`);` },
    { code: 'export const q = value.replace(/\\n/g, "\\\\n");' },
    { code: 'export const q = escapeBackslashes(value).replace(/"/g, \'\\\\"\');' },
    {
      code:
        'export function f(v: string) { const a = v.replace(/\\\\/g, "\\\\\\\\"); return a.replace(/"/g, ' +
        "'\\\\\"'); }",
    },
    { code: 'export const u = text.replace(/\\\\(["\'nt\\\\])/g, (_, c) => table[c]);' },
    { code: 'export const u = text.replace(/\\\\n/g, "\\n");' },
    { code: 'export const q = value.replace(/"/g, "\\\\");' },
  ],
  invalid: [
    flagged(`export const quoted = \`"\${value.replace(/"/g, '\\\\"')}"\`;`),
    flagged('export const q = value.replaceAll("\'", "\\\\\'");'),
    flagged('export const q = value.replace(/[{}]/g, "\\\\$&");'),
    flagged('export const q = value.replace(/"/g, \'\\\\"\').replace(/\\\\/g, "\\\\\\\\");'),
    flagged('export const q = value.replace(/\\n/g, " ").replace(/"/g, \'\\\\"\');'),
    flagged(
      'export const u = text.replace(/\\\\"/g, \'"\').replace(/\\\\\\\\/g, "\\\\");',
      'unescapeOrder',
    ),
    flagged(
      'export const u = text.replace(/\\\\\\\\/g, "\\\\").replace(/\\\\n/g, "\\n");',
      'unescapeOrder',
    ),
  ],
});
