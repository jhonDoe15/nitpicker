import { describe, expect, it } from 'vitest';
import { evaluateCoupling } from '../evaluate-coupling.mts';
import { analyzeCoupling } from '../test-support/analyze-view.mts';

const ROOT = 'src/main';

type Import = readonly [from: string, to: string, kind?: 'type-only'];

function graphOf(imports: readonly Import[]) {
  const files = [...new Set(imports.flatMap(([from, to]) => [from, to]))];
  return {
    modules: files.map((file) => ({
      source: `${ROOT}/${file}`,
      dependencies: imports
        .filter(([from]) => from === file)
        .map(([, to, kind]) => ({
          resolved: `${ROOT}/${to}`,
          dependencyTypes: [kind ?? 'local'],
        })),
    })),
  };
}

function cyclesOf(imports: readonly Import[], exceptions: readonly unknown[] = []) {
  const report = analyzeCoupling(graphOf(imports), ROOT);
  const findings = evaluateCoupling(
    { ...report, modules: report.modules.map(({ source }) => ({ file: source })) },
    'coupling',
    exceptions,
  );
  return findings
    .filter(({ rule }) => rule === 'package-cycle')
    .map(({ path, identity }) => `${path} ${identity}`);
}

describe('folder cycles', () => {
  it('reports each folder of a cycle between folders that no module cycle explains', () => {
    expect(
      cyclesOf([
        ['orders/a.ts', 'billing/b.ts'],
        ['billing/c.ts', 'orders/d.ts'],
      ]),
    ).toEqual([
      `${ROOT}/billing/b.ts cycle:${ROOT}/billing`,
      `${ROOT}/orders/a.ts cycle:${ROOT}/orders`,
    ]);
  });

  it('names the other folders of the cycle and the exception route in the message', () => {
    const report = analyzeCoupling(
      graphOf([
        ['orders/a.ts', 'billing/b.ts'],
        ['billing/c.ts', 'orders/d.ts'],
      ]),
      ROOT,
    );
    const [first] = evaluateCoupling(
      { ...report, modules: report.modules.map(({ source }) => ({ file: source })) },
      'coupling',
    ).filter(({ rule }) => rule === 'package-cycle');

    expect(first?.message).toBe(
      `Folder ${ROOT}/billing is in a dependency cycle with ${ROOT}/orders. ` +
        'Move the shared types down into one of them, or invert one dependency behind an interface. ' +
        `If this is intended, add {"rule":"package-cycle","paths":["${ROOT}/billing/b.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
    );
  });

  it('reports a module cycle between two folders once for the folders, as the module rule does for the modules', () => {
    expect(
      cyclesOf([
        ['orders/a.ts', 'billing/b.ts'],
        ['billing/b.ts', 'orders/a.ts'],
      ]),
    ).toEqual([
      `${ROOT}/billing/b.ts cycle:${ROOT}/billing`,
      `${ROOT}/orders/a.ts cycle:${ROOT}/orders`,
    ]);
  });

  it('does not report a back edge that is only a type import', () => {
    expect(
      cyclesOf([
        ['orders/a.ts', 'billing/b.ts'],
        ['billing/c.ts', 'orders/d.ts', 'type-only'],
      ]),
    ).toEqual([]);
  });

  it('does not report folders that depend in one direction', () => {
    expect(
      cyclesOf([
        ['orders/a.ts', 'billing/b.ts'],
        ['billing/b.ts', 'shared/c.ts'],
      ]),
    ).toEqual([]);
  });

  it('leaves a cycle between features to feature-cycle, and reports one that a feature cycle does not explain', () => {
    const features = 'features';
    const explained = cyclesOf([
      [`${features}/orders/index.ts`, `${features}/billing/index.ts`],
      [`${features}/billing/index.ts`, `${features}/orders/index.ts`],
    ]);
    const unexplained = cyclesOf([
      [`${features}/orders/ui/panel.ts`, `${features}/orders/model/order.ts`],
      [`${features}/orders/model/order.ts`, `${features}/orders/ui/panel.ts`],
    ]);

    expect(explained).toEqual([]);
    expect(unexplained).toHaveLength(2);
  });

  it.each([
    ['auth', 'index.ts', 'login/form.ts', 'types.ts'],
    ['pages', 'index.ts', 'home/home.ts', 'layout.ts'],
  ])('does not report %s, a folder and its own subfolder', (folder, barrel, child, parent) => {
    expect(
      cyclesOf([
        [`${folder}/${barrel}`, `${folder}/${child}`],
        [`${folder}/${child}`, `${folder}/${parent}`],
      ]),
    ).toEqual([]);
  });

  it('honours an exception on the path of the folder', () => {
    const imports: Import[] = [
      ['orders/a.ts', 'billing/b.ts'],
      ['billing/c.ts', 'orders/d.ts'],
    ];

    expect(
      cyclesOf(imports, [
        { rule: 'package-cycle', paths: [`${ROOT}/billing/**`], reason: 'legacy' },
      ]),
    ).toEqual([`${ROOT}/orders/a.ts cycle:${ROOT}/orders`]);
  });
});
