import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-hand-quoted-generated-code.mts';

const tester = typescriptRuleTester();

function flagged(code: string, count = 1) {
  return { code, errors: Array.from({ length: count }, () => ({ messageId: 'quoteValue' })) };
}

tester.run('no-hand-quoted-generated-code', rule, {
  valid: [
    { code: 'export const a = `import { x } from "${FRAMEWORK_SOURCE}"`;' },
    { code: 'export const a = `const ${local} = ${mod}[${JSON.stringify(importedName)}]`;' },
    { code: 'export const a = `type.default(${JSON.stringify(value)})`;' },
    { code: 'export const a = `import ${local} from "react"`;' },
    { code: 'const dep = "vue"; export const a = `import x from "${dep}"`;' },
    { code: 'export const a = `<a class="${name}" href="/import">docs</a>`;' },
    { code: 'export const a = `Unknown value "${name}"`;' },
    { code: 'export const a = `Cannot import "${name}" here`;' },
    { code: 'export const a = `const x = [${items.length}]`;' },
    { code: 'export function f(n: number) { return `const a = "${n}"`; }' },
    { code: 'export const a = css`import "${x}"`;' },
    { code: 'export const a = `export const v = "${quote(value)}"`;' },
    { code: 'export const a = `require("${count}")`;' },
    { code: 'export const a = `const x = ${value}`;' },
    { code: 'export const a = `<script nonce="${nonce}">const x = 1;</script>`;' },
    { code: 'export const a = `Failed to resolve import "${name}" from "${id}"`;' },
    { code: 'export const a = `targetDefaults["${name}"]`;' },
    { code: "export const a = `import x from 'y';\\nconst c = { main: '${options.main}' };`;" },
    {
      code: 'export function f(rawId: string) { throw new SyntaxError(`import pkg from "${rawId}";`); }',
    },
    {
      code:
        'const mk = (s: string) => `data:text/javascript,${JSON.stringify(s)}`; ' +
        'export const a = `import "${mk(id)}"`;',
    },
    { code: 'console.log(`import pkg from "${rawId}";`);' },
    {
      code: 'const hmr = join(__dirname, \'./hmr.js\'); export const a = `import x from "${hmr}"`;',
    },
  ],
  invalid: [
    flagged('export const a = `const ${local} = ${mod}["${importedName}"]`;'),
    flagged('export const a = `.default("${attr.defaultValue}")`;'),
    flagged('export const a = `import { x } from "${specifier}";`;'),
    flagged("export const a = `export * from '${file}'`;"),
    flagged('export const a = `const req = require("${name}")`;'),
    flagged('export const a = `const x = ${ns}["${exportName}"]`;'),
    flagged('export const a = `import "${a}"; import "${b}";`;', 2),
    flagged('export const a = `export const a = "${s}"`;'),
    flagged("export const a = `const name = '${v}'`;"),
  ],
});
