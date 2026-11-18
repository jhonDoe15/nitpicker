import { afterAll } from 'vitest';
import { rule } from '../../rules/concurrency/unbounded-fan-out.mts';
import { typedProject } from './typed-project.mts';

const IMPORT = "import pLimit from 'p-limit';\n";
const esm = typedProject('p-limit-keep-', {
  type: 'module',
  dependencies: { 'p-limit': '^6.0.0' },
});
const none = typedProject('p-limit-none-', { type: 'module', dependencies: { 'p-map': '^7.0.0' } });
const dev = typedProject('p-limit-dev-', {
  type: 'module',
  devDependencies: { 'p-limit': '^6.0.0' },
});
const cjs = typedProject('p-limit-cjs-', { dependencies: { 'p-limit': '^4.0.0' } });
const oldCjs = typedProject('p-limit-old-', { dependencies: { 'p-limit': '^3.1.0' } });
afterAll(() => {
  for (const project of [esm, none, dev, cjs, oldCjs]) {
    project.cleanup();
  }
});

const KEPT = [{ messageId: 'unbounded' }] as never;
const CALL =
  'export async function d(us: string[]) { return Promise.allSettled(us.map((u) => fetch(u))); }';

function kept(project: typeof esm, code: string) {
  return project.typed(code, KEPT);
}

esm.tester.run('limiter suggestion declines on the call shape', rule, {
  valid: [],
  invalid: [
    kept(
      esm,
      'const download = (u: string) => fetch(u);\nexport async function d(us: string[]) { return Promise.allSettled(us.map(download)); }',
    ),
    kept(
      esm,
      'export async function d(us: string[]) { return Promise.allSettled(us.map(function (u) { return fetch(u); })); }',
    ),
    kept(esm, 'export const d = (us: string[]) => Promise.allSettled(us.map((u) => fetch(u)));'),
    kept(
      esm,
      'declare const us: string[];\nexport const all = await Promise.allSettled(us.map((u) => fetch(u)));',
    ),
    kept(
      esm,
      'export class C { urls: string[] = []; all = Promise.allSettled(this.urls.map((u) => fetch(u))); }',
    ),
    kept(
      esm,
      'export async function d(us: string[]) { return Promise.allSettled(us.map((u) => /* x */ fetch(u))); }',
    ),
    kept(
      esm,
      'export async function d(us: string[], self: object) { return Promise.allSettled(us.map((u) => fetch(u), self)); }',
    ),
    kept(
      esm,
      'export async function d(us: string[]) { return Promise.allSettled([...us.map((u) => fetch(u))]); }',
    ),
    kept(
      esm,
      'declare function timeout(ms: number): Promise<never>;\nexport async function d(us: string[]) { return Promise.race([Promise.allSettled(us.map((u) => fetch(u))), timeout(5000)]); }',
    ),
    kept(
      esm,
      'declare function withTimeout<T>(work: Promise<T>, ms: number): Promise<T>;\nexport async function d(us: string[]) { return withTimeout(Promise.allSettled(us.map((u) => fetch(u))), 5000); }',
    ),
    kept(
      esm,
      'const pLimit = 1;\nexport async function d(us: string[]) { return Promise.allSettled(us.map((u) => fetch(u))) && pLimit; }',
    ),
    kept(
      esm,
      'import pLimit from "other";\nexport async function d(us: string[]) { return Promise.allSettled(us.map((u) => fetch(u))) && pLimit; }',
    ),
    kept(
      esm,
      `${IMPORT}export async function d(us: string[]) { const pLimit = 2; return Promise.allSettled(us.map((u) => fetch(u))) && pLimit; }`,
    ),
  ],
});

none.tester.run('limiter suggestion needs the dependency', rule, {
  valid: [],
  invalid: [kept(none, CALL)],
});
dev.tester.run('limiter suggestion needs a runtime dependency', rule, {
  valid: [],
  invalid: [kept(dev, CALL)],
});
cjs.tester.run('limiter suggestion needs an ES module for p-limit 4 and later', rule, {
  valid: [],
  invalid: [kept(cjs, CALL)],
});
oldCjs.tester.run('limiter suggestion keeps p-limit 3 in a CommonJS project', rule, {
  valid: [],
  invalid: [
    oldCjs.typed(CALL, [
      {
        messageId: 'unbounded',
        suggestions: [
          {
            messageId: 'useLimit',
            output: `import pLimit from 'p-limit';\nexport async function d(us: string[]) { const limit = pLimit(8); return Promise.allSettled(us.map((u) => limit(() => fetch(u)))); }`,
          },
        ],
      },
    ] as never),
  ],
});
