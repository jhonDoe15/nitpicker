import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-truncating-split-limit.mts';

const tester = typescriptRuleTester();

function flagged(code: string) {
  return { code, errors: [{ messageId: 'truncated' }] };
}

tester.run('no-truncating-split-limit', rule, {
  valid: [
    'const head = text.split(":", 1)[0];',
    'const [head] = text.split(":", 1);',
    'const [a, b] = text.split(":");',
    'const [a, b] = text.split(":", 3);',
    'const [a] = text.split(":", 2);',
    'const first = text.split(":", 2)[0];',
    'const parts = text.split(":", 2); const first = parts[0];',
    'const parts = text.split(":", 2); use(parts);',
    'const parts = text.split(":", limit); const last = parts[1];',
    'const [head, ...rest] = text.split(":");',
    'const i = text.indexOf(":"); const user = text.slice(0, i); const pass = text.slice(i + 1);',
    'const value = arg.split("=")[1];',
    'const part = text.split(":", 2).length;',
    'const part = text.split(":", 2).map(trim);',
    'const [a, b] = split(text, ":", 2);',
    'const [a, b, c] = text.split(":", 2);',
    'const [a, , c] = text.split(":", 3).slice(0);',
    'const [a, b] = text.split(sep, 1);',
    'const [all, val] = value.split(/[=](.+)/, 2);',
  ],
  invalid: [
    flagged('const [username, password] = decoded.split(":", 2);'),
    flagged('const value = arg.split("=", 2)[1];'),
    flagged('const [a, b, c] = text.split("=", 3);'),
    flagged('const last = text.split(":", 2).pop();'),
    flagged('const last = text.split(":", 3).at(-1);'),
    flagged('const parts = text.split(":", 2); const secret = parts[1];'),
    flagged('const parts = text.split(":", 2); const secret = parts.pop();'),
    flagged('const parts = text.split(":", 2); const [user, secret] = parts;'),
    flagged('const value = (arg as string).split("=", 2)[1];'),
    flagged('const part = line.split(" ", 2)[1];'),
    flagged('const subtype = mime.split("/", 2)[1];'),
    flagged('const [entity, field] = path.split(".", 2);'),
    flagged('const [a, b] = text.split(sep, 2);'),
    flagged('const [a, b] = text.split(/:/, 2);'),
  ],
});
