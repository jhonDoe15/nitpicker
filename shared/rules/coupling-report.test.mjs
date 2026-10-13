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
      { file: 'core/a.py', fanIn: 1, fanOut: 1, totalCoupling: 2, instability: 0.5 },
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
      { source: 'stable', target: 'volatile', delta: 0.1667 },
    ]);
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
