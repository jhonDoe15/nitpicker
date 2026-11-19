import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-btoa-on-runtime-text.mts';

const tester = typescriptRuleTester();

function flagged(code: string) {
  return { code, errors: [{ messageId: 'utf8First' }] };
}

tester.run('no-btoa-on-runtime-text', rule, {
  valid: [
    { code: 'export const a = btoa("user:pass");' },
    { code: `const user = "admin"; export const a = btoa(\`\${user}:secret\`);` },
    { code: 'export const a = btoa(String.fromCharCode(...bytes));' },
    { code: 'export const a = btoa(String.fromCharCode.apply(null, bytes));' },
    { code: 'export const a = btoa(unescape(encodeURIComponent(text)));' },
    { code: 'export const a = btoa(encodeURIComponent(text));' },
    {
      code:
        'export function f(bytes: Uint8Array) { let s = ""; for (const b of bytes) { s += ' +
        'String.fromCharCode(b); } return btoa(s); }',
    },
    { code: 'export function f(binary: string) { return btoa(binary); }' },
    { code: 'export const a = btoa(buffer.toString("binary"));' },
    { code: 'export const a = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));' },
    { code: 'import { btoa } from "./safe"; export const a = btoa(text);' },
    { code: 'export function btoa(text: string) { return text; } export const a = btoa(value);' },
    { code: 'export const a = Buffer.from(text, "utf8").toString("base64");' },
    { code: 'export const a = other.btoa(text);' },
    { code: 'export const a = btoa();' },
    {
      code:
        'export function f(b: Uint8Array) { const chunks: string[] = []; ' +
        'chunks.push(String.fromCharCode(...b)); return btoa(chunks.join("")); }',
    },
    {
      code:
        'const utf8 = (x: string) => unescape(encodeURIComponent(x)); ' +
        `export function f(t: string) { const c = utf8(t); return btoa(\`\${c.length}\${c}\`); }`,
    },
    {
      code: 'export function f(t: string) { try { return btoa(t); } catch { return fallback(t); } }',
    },
  ],
  invalid: [
    flagged('export function f(t: string) { try { return 1; } catch { return btoa(t); } }'),
    flagged(`export const h = \`Basic \${btoa(\`\${user}:\${password}\`)}\`;`),
    flagged('export const h = btoa(password);'),
    flagged('export const h = btoa(rawJson);'),
    flagged('export const h = btoa(rawPassword);'),
    flagged('export const h = window.btoa(user + ":" + secret);'),
    flagged('export const h = globalThis.btoa(JSON.stringify(payload));'),
    flagged('export function f(svg: string) { return btoa(svg); }'),
    flagged(
      `export function f(text: string) { return \`data:image/svg+xml;base64,\${self.btoa(text)}\`; }`,
    ),
    flagged(
      'export function f(map: object) { const text = JSON.stringify(map); return btoa(text); }',
    ),
    flagged('export const h = btoa(await readText());'),
  ],
});
