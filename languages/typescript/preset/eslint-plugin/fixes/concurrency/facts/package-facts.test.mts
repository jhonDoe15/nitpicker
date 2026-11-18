import { afterAll } from 'vitest';
import { rule } from '../../../rules/concurrency/unbounded-fan-out.mts';
import { typedProject } from '../typed-project.mts';

const CALL =
  'declare const ids: string[];\nexport async function f() { return Promise.all(ids.map((id) => fetch(id))); }';
const OUTPUT = `import pMap from 'p-map';\ndeclare const ids: string[];\nexport async function f() { return pMap(ids, (id) => fetch(id), { concurrency: 8 }); }`;
const ACCEPTED = ['~4.1.0', '^4.0.0', '4', '4.x', '4.0.0', '^3.1.0'];
const DECLINED = [
  '>=2',
  '~3.0.0 || ^7.0.0',
  '^4.0.0 || ^7.0.0',
  '*',
  'x',
  'latest',
  '>=4 <6',
  '^5.0.0',
  'workspace:*',
  'npm:p-map@^7.0.0',
  'file:../p-map',
  'link:../p-map',
  'github:sindresorhus/p-map',
  'https://example.invalid/p-map.tgz',
  '4 - 7',
];

const projects = [...ACCEPTED, ...DECLINED].map((range) => ({
  range,
  project: typedProject('p-map-range-', { dependencies: { 'p-map': range } }),
}));
afterAll(() => {
  for (const { project } of projects) {
    project.cleanup();
  }
});

for (const { range, project } of projects) {
  const accepted = ACCEPTED.includes(range);
  project.tester.run(`p-map ${range} in a CommonJS project`, rule, {
    valid: [],
    invalid: [
      project.typed(CALL, [
        accepted
          ? { messageId: 'unbounded', suggestions: [{ messageId: 'usePMap', output: OUTPUT }] }
          : { messageId: 'unbounded' },
      ] as never),
    ],
  });
}
