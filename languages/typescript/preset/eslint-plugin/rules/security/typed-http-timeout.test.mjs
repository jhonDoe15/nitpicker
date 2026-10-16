import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './require-http-timeout.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-http-typed-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2022', 'DOM'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });
const header =
  'import https from "node:https";\nimport type { RequestOptions } from "node:https";\n';
let counter = 0;

function typed(body, errors) {
  counter += 1;
  const code = `${header}${body}`;
  const file = path.join(root, `src/case-${String(counter)}.ts`);
  writeFileSync(file, code);
  return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
}

tester.run('require-http-timeout with types', rule, {
  valid: [
    typed(
      'export const get = (options: RequestOptions) => https.get(options, (res) => res.resume());',
    ),
    typed(
      'export const get = (url: string) => https.get(url, { timeout: 5000 }, (res) => res.resume());',
    ),
  ],
  invalid: [
    typed('export const get = (url: string) => https.get(url, (res) => res.resume());', [
      { messageId: 'noTimeout', data: { call: 'http.get()' } },
    ]),
    typed('export const get = (url: URL) => https.get(url, (res) => res.resume());', [
      { messageId: 'noTimeout', data: { call: 'http.get()' } },
    ]),
  ],
});
