import { createRuleTester } from './test-support/rule-tester.mjs';
import { rule as noUnsafePathJoin } from './no-unsafe-path-join.mjs';

const tester = createRuleTester();
const HEAD = 'import fs from "node:fs"; import path from "node:path"; ';

function inFunction(body, parameters = 'dir') {
  return `${HEAD}export function f(${parameters}) { ${body} }`;
}

tester.run('no-unsafe-path-join with directory listings', noUnsafePathJoin, {
  valid: [
    {
      code: inFunction(
        'try { return fs.readFileSync(dir); } catch (name) { return fs.readFileSync(path.join(dir, name)); }',
      ),
    },
    {
      code: `${HEAD}import name from "./name.mjs"; export function f(dir) { return fs.readFileSync(path.join(dir, name)); }`,
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir, { withFileTypes: true }).map((e) => fs.readFileSync(path.join(e.parentPath, e.name)));',
      ),
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir, { recursive: true }).map((name) => fs.readFileSync(path.join(dir, name)));',
      ),
    },
    {
      code: `import { readdir, readFile } from "node:fs/promises"; import path from "node:path"; export function f(dir) { return readdir(dir).then((names) => names.map((name) => readFile(path.join(dir, name)))); }`,
    },
    {
      code: inFunction(
        'const names = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []; return names.flatMap((name) => fs.readFileSync(path.join(dir, name)));',
      ),
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir).map((name) => fs.readFileSync(path.join(dir, name), "utf8"));',
      ),
    },
    {
      code: `import { readdirSync, readFileSync } from "node:fs"; import { join } from "node:path"; export function f(root) { for (const entry of readdirSync(root)) { readFileSync(join(root, entry)); } }`,
    },
    {
      code: inFunction(
        'const names = fs.readdirSync(dir).filter((n) => n.endsWith(".json")); return names.map((name) => fs.readFileSync(path.join(dir, name)));',
      ),
    },
    {
      code: `import { readdir, readFile } from "node:fs/promises"; import path from "node:path"; export async function f(dir) { for (const name of await readdir(dir)) { await readFile(path.join(dir, name)); } }`,
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir, { withFileTypes: true }).map((entry) => fs.readFileSync(path.join(dir, entry.name)));',
      ),
    },
    {
      code: `import { opendirSync, statSync } from "node:fs"; import path from "node:path"; export function f(dir) { const handle = opendirSync(dir); for (const entry of handle) { statSync(path.join(dir, entry.name)); } }`,
    },
    {
      code: inFunction(
        `return fs.readdirSync(dir).map((name) => fs.readFileSync(\`\${dir}/\${name}\`));`,
      ),
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir.root).map((name) => fs.readFileSync(path.join(dir.root, name)));',
      ),
    },
  ],
  invalid: [
    {
      code: inFunction(
        'const names = fs.readdirSync(dir); names.push(extra); return names.map((name) => fs.readFileSync(path.join(dir, name)));',
        'dir, extra',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'for (let name of fs.readdirSync(dir)) { name = extra; fs.readFileSync(path.join(dir, name)); }',
        'dir, extra',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir).map((name) => { name = extra; return fs.readFileSync(path.join(dir, name)); });',
        'dir, extra',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir).map((name) => { dir = extra; return fs.readFileSync(path.join(dir, name)); });',
        'dir, extra',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir, { withFileTypes: true }).map((e) => fs.readFileSync(path.join(extra, e.name)));',
        'dir, extra',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'const names = flag ? fs.readdirSync(dir) : fs.readdirSync(other); return names.map((name) => fs.readFileSync(path.join(dir, name)));',
        'dir, other, flag',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir).map((name) => fs.readFileSync(path.join(other, name)));',
        'dir, other',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir).map((name) => fs.readFileSync(path.join(dir, name, extra)));',
        'dir, extra',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        `return fs.readdirSync(dir).map((name) => fs.readFileSync(path.join(dir, \`\${name}/\${extra}\`)));`,
        'dir, extra',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir).map((name) => fs.readFileSync(path.join(path.join(dir, name), requested)));',
        'dir, requested',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'return fs.readdirSync(other).map((name) => fs.readFileSync(path.join(dir, name)));',
        'dir, other',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction('return fs.readFileSync(path.join(dir, name));', 'dir, name'),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir).map((name) => fs.readFileSync(path.join("/srv", name)));',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'return fs.readdirSync(dir).map((name, index) => fs.readFileSync(path.join(dir, String(index) + requested)));',
        'dir, requested',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: inFunction(
        'return names.map((name) => fs.readFileSync(path.join(dir, name)));',
        'dir, names',
      ),
      errors: [{ messageId: 'unsafePath' }],
    },
  ],
});
