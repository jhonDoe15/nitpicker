import { rule } from '../../rules/concurrency/unbounded-fan-out.mts';
import { cleanupAfterAll, dependencyProjects, kept, typedProject } from './typed-project.mts';

const IMPORT = "import pMap from 'p-map';\n";
const { esm, missing, devOnly, commonjs, oldCommonjs } = dependencyProjects('p-map', {
  esm: '^7.0.0',
  commonjs: '^5.0.0',
  oldCommonjs: '^4.0.0',
});
const unknownVersion = typedProject('p-map-latest-', { dependencies: { 'p-map': 'latest' } });
cleanupAfterAll([unknownVersion]);

const CALL =
  'declare const ids: string[];\nexport async function f() { return Promise.all(ids.map((id) => fetch(id))); }';

esm.tester.run('pMap suggestion declines on the call shape', rule, {
  valid: [],
  invalid: [
    kept(
      esm,
      'declare const ids: string[];\nexport async function f() { return Promise.all(ids.map((id, i) => fetch(id + i))); }',
    ),
    kept(
      esm,
      'declare const ids: string[];\nexport async function f() { return Promise.all(ids.map((id, i, all) => fetch(id + all[i]))); }',
    ),
    kept(
      esm,
      'declare const ids: string[];\nexport async function f() { return Promise.all(ids.map((...args) => fetch(String(args[0])))); }',
    ),
    kept(
      esm,
      'declare const ids: string[];\nexport async function f() { return Promise.all(ids.map(function (id) { return this.send(id) && fetch(id); })); }',
    ),
    kept(
      esm,
      'declare const ids: string[];\nexport async function f() { return Promise.all(ids.map(function () { return fetch(arguments[0]); })); }',
    ),
    kept(
      esm,
      'declare const ids: string[];\nexport async function f(client: object) { return Promise.all(ids.map(function (id) { return fetch(id); }, client)); }',
    ),
    kept(
      esm,
      'declare const ps: Promise<string>[];\nexport async function f() { return Promise.all(ps.map((p) => fetch(String(p)))); }',
    ),
    kept(
      esm,
      'declare const ids: any[];\nexport async function f() { return Promise.all(ids.map((id) => fetch(id))); }',
    ),
    kept(
      esm,
      'export async function f<T extends string | Promise<string>>(ids: T[]) { return Promise.all(ids.map((id) => fetch(String(id)))); }',
    ),
    kept(
      esm,
      'declare const ids: string[];\nexport function f() { return Promise.all(ids.map((id) => fetch(id))); }',
    ),
    kept(
      esm,
      'declare const ids: string[];\nexport const f = () => Promise.all(ids.map((id) => fetch(id)));',
    ),
    kept(
      esm,
      'declare const rx: { map(f: (x: string) => Promise<Response>): Promise<Response>[] };\nexport async function f() { return Promise.all(rx.map((id) => fetch(id))); }',
    ),
    kept(
      esm,
      'declare const ids: string[];\nexport async function f() { return Promise.all(ids.map((id) => fetch(id /* x */))); }',
    ),
    kept(
      esm,
      'declare const ids: string[];\nexport async function f() { return Promise.all([...ids.map((id) => fetch(id))]); }',
    ),
    kept(
      esm,
      'const pMap = 1;\ndeclare const ids: string[];\nexport async function f() { return Promise.all(ids.map((id) => fetch(id))) && pMap; }',
    ),
    kept(
      esm,
      'import pMap from "other";\ndeclare const ids: string[];\nexport async function f() { return Promise.all(ids.map((id) => fetch(id))) && pMap; }',
    ),
    kept(
      esm,
      'declare const ids: string[];\nexport async function f() { const pMap = 2; return Promise.all(ids.map((id) => fetch(id))) && pMap; }',
    ),
    kept(
      esm,
      `${IMPORT}declare const ids: string[];\nexport async function f() { const pMap = 2; return Promise.all(ids.map((id) => fetch(id))) && pMap; }`,
    ),
  ],
});

esm.tester.run('pMap suggestion declines under a deadline', rule, {
  valid: [],
  invalid: [
    kept(
      esm,
      'declare function timeout(ms: number): Promise<never>;\ndeclare const ids: string[];\nexport async function f() { return Promise.race([Promise.all(ids.map((id) => fetch(id))), timeout(5000)]); }',
    ),
    kept(
      esm,
      'declare function timeout(ms: number): Promise<never>;\ndeclare const ids: string[];\nexport async function f() { const work = Promise.all(ids.map((id) => fetch(id))); return Promise.race([work, timeout(5000)]); }',
    ),
    kept(
      esm,
      'declare function withTimeout<T>(work: Promise<T>, ms: number): Promise<T>;\ndeclare const ids: string[];\nexport async function f() { return withTimeout(Promise.all(ids.map((id) => fetch(id))), 5000); }',
    ),
    kept(
      esm,
      'declare function timeout(ms: number): Promise<never>;\ndeclare const ids: string[];\nexport async function f() { const work = await Promise.all(ids.map((id) => fetch(id))); return work; }'.replace(
        'const work = await Promise.all(ids.map((id) => fetch(id))); return work;',
        'return await Promise.race([Promise.all(ids.map((id) => fetch(id))), timeout(1)]);',
      ),
    ),
  ],
});

missing.tester.run('pMap suggestion needs the dependency', rule, {
  valid: [],
  invalid: [kept(missing, CALL)],
});
devOnly.tester.run('pMap suggestion needs a runtime dependency', rule, {
  valid: [],
  invalid: [kept(devOnly, CALL)],
});
commonjs.tester.run('pMap suggestion needs an ES module for p-map 5 and later', rule, {
  valid: [],
  invalid: [kept(commonjs, CALL)],
});
unknownVersion.tester.run(
  'pMap suggestion declines an unknown version in a CommonJS project',
  rule,
  {
    valid: [],
    invalid: [kept(unknownVersion, CALL)],
  },
);
oldCommonjs.tester.run('pMap suggestion keeps p-map 4 in a CommonJS project', rule, {
  valid: [],
  invalid: [
    oldCommonjs.typed(CALL, [
      {
        messageId: 'unbounded',
        suggestions: [
          {
            messageId: 'usePMap',
            output: `import pMap from 'p-map';\ndeclare const ids: string[];\nexport async function f() { return pMap(ids, (id) => fetch(id), { concurrency: 8 }); }`,
          },
        ],
      },
    ]),
  ],
});
