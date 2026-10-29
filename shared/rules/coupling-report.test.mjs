import { describe, expect, it } from 'vitest';
import { buildCouplingReport } from './coupling.mjs';

const packageOf = (module) => module.split('/')[0];
const fileOf = (module) => `${module}.py`;

describe('coupling report on a neutral module graph', () => {
  it('summarizes the graph and reports each module against its file', () => {
    const report = buildCouplingReport({
      modules: ['core/a', 'core/b', 'ui/x'],
      edges: [
        { source: 'ui/x', target: 'core/a' },
        { source: 'core/a', target: 'core/b' },
      ],
      packageOf,
      fileOf,
    });

    expect(report.summary).toEqual({ modules: 3, dependencies: 2, packages: 2 });
    expect(report.modules).toEqual([
      {
        file: 'core/a.py',
        fanIn: 1,
        fanOut: 1,
        totalCoupling: 2,
        instability: expect.closeTo(0.5, 10),
      },
      { file: 'core/b.py', fanIn: 1, fanOut: 0, totalCoupling: 1, instability: 0 },
      { file: 'ui/x.py', fanIn: 0, fanOut: 1, totalCoupling: 1, instability: 1 },
    ]);
    expect(report.packages.map(({ name }) => name)).toEqual(['core', 'ui']);
    expect(report.stabilityDirection).toEqual([]);
  });

  it('ignores self, repeated and external edges', () => {
    const report = buildCouplingReport({
      modules: ['core/a', 'ui/x'],
      edges: [
        { source: 'ui/x', target: 'ui/x' },
        { source: 'ui/x', target: 'core/a' },
        { source: 'ui/x', target: 'core/a' },
        { source: 'ui/x', target: 'elsewhere/z' },
        { source: 'elsewhere/z', target: 'core/a' },
      ],
      packageOf,
      fileOf,
    });

    expect(report.summary.dependencies).toBe(1);
  });

  it('lists a package that depends on a less stable one', () => {
    const report = buildCouplingReport({
      modules: ['p1/a', 'p2/a', 'stable/s', 'volatile/v', 'leaf/q'],
      edges: [
        { source: 'p1/a', target: 'stable/s' },
        { source: 'p2/a', target: 'stable/s' },
        { source: 'stable/s', target: 'volatile/v' },
        { source: 'volatile/v', target: 'leaf/q' },
      ],
      packageOf,
      fileOf,
    });

    expect(report.stabilityDirection).toEqual([
      { source: 'stable', target: 'volatile', delta: expect.closeTo(0.1667, 10) },
    ]);
  });

  describe('type-only edges', () => {
    const modules = ['p1/a', 'p2/a', 'stable/s', 'volatile/v', 'leaf/q'];
    const edges = [
      { source: 'p1/a', target: 'stable/s' },
      { source: 'p2/a', target: 'stable/s' },
      { source: 'volatile/v', target: 'leaf/q' },
    ];
    const reportWith = (...extra) =>
      buildCouplingReport({ modules, edges: [...edges, ...extra], packageOf, fileOf });
    const inversion = { source: 'stable/s', target: 'volatile/v' };

    it('count in the metrics but are never reported as a stability inversion themselves', () => {
      const report = reportWith({ ...inversion, kind: 'type-only' });

      expect(report.summary.dependencies).toBe(4);
      expect(report.modules.find(({ file }) => file === 'stable/s.py')).toEqual({
        file: 'stable/s.py',
        fanIn: 2,
        fanOut: 1,
        totalCoupling: 3,
        instability: expect.closeTo(0.3333, 10),
      });
      expect(report.stabilityDirection).toEqual([]);
    });

    it('moving unrelated edges to type-only does not create an inversion elsewhere', () => {
      const edgesOf = (kind) => [
        { source: 'x/x1', target: 's/m' },
        { source: 'x/x2', target: 's/m' },
        { source: 's/m', target: 't/m' },
        { source: 't/m', target: 'w/m' },
        ...['z1', 'z2', 'z3'].map((name) => ({ source: `z/${name}`, target: 't/m', kind })),
      ];
      const reportOf = (kind) =>
        buildCouplingReport({
          modules: ['x/x1', 'x/x2', 'z/z1', 'z/z2', 'z/z3', 's/m', 't/m', 'w/m'],
          edges: edgesOf(kind),
          packageOf,
          fileOf,
        });

      expect(reportOf('runtime').stabilityDirection).toEqual([]);
      expect(reportOf('type-only').stabilityDirection).toEqual([]);
      expect(reportOf('type-only').packages).toEqual(reportOf('runtime').packages);
    });

    it('are runtime edges once any copy of the edge is a runtime edge', () => {
      const typeOnly = { ...inversion, kind: 'type-only' };
      const expected = [{ source: 'stable', target: 'volatile', delta: 0.1667 }];

      expect(reportWith(typeOnly, inversion).stabilityDirection).toEqual(expected);
      expect(reportWith(inversion, typeOnly).stabilityDirection).toEqual(expected);
      expect(reportWith(typeOnly, typeOnly).summary.dependencies).toBe(4);
    });
  });

  it('orders packages by name', () => {
    const report = buildCouplingReport({
      modules: ['b/x', 'a/x', 'B/x'],
      edges: [],
      packageOf,
      fileOf,
    });

    expect(report.packages.map(({ name }) => name)).toEqual(['B', 'a', 'b']);
  });
});
