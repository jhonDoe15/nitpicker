import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { cycleFindings, cyclicComponents } from './cycles.mjs';

const packageOf = (name) => name.slice(0, name.lastIndexOf('.'));
const fileOf = (name) => `src/main/java/${name.replaceAll('.', '/')}.java`;
const edge = (source, target) => ({ source, target });
const findings = (modules, edges) =>
  cycleFindings({ modules, edges, packageOf, fileOf }, 'coupling');

describe('cyclicComponents', () => {
  it('finds the members of a loop, not the nodes that only lead into it', () => {
    const components = cyclicComponents(
      ['a', 'b', 'c', 'd'],
      [edge('a', 'b'), edge('b', 'c'), edge('c', 'b'), edge('c', 'd')],
    );

    expect(components).toEqual([['b', 'c']]);
  });

  it('keeps two separate loops apart and sorts them', () => {
    const components = cyclicComponents(
      ['p', 'q', 'a', 'b'],
      [edge('q', 'p'), edge('p', 'q'), edge('b', 'a'), edge('a', 'b')],
    );

    expect(components).toEqual([
      ['a', 'b'],
      ['p', 'q'],
    ]);
  });

  it('reports one component for a long ring', () => {
    const nodes = ['n1', 'n2', 'n3', 'n4', 'n5'];
    const ring = nodes.map((node, index) => edge(node, nodes[(index + 1) % nodes.length]));

    expect(cyclicComponents(nodes, ring)).toEqual([nodes]);
  });

  it('ignores a node that depends on itself and a graph without loops', () => {
    expect(cyclicComponents(['a', 'b'], [edge('a', 'a'), edge('a', 'b')])).toEqual([]);
  });

  it('does not overflow the stack on a deep chain that closes into a loop', () => {
    const nodes = Array.from({ length: 20_000 }, (_, index) => `n${String(index)}`);
    const chain = nodes.map((node, index) => edge(node, nodes[(index + 1) % nodes.length]));

    expect(cyclicComponents(nodes, chain)).toHaveLength(1);
  });
});

describe('cycleFindings', () => {
  const modules = ['app.a.Alpha', 'app.b.Beta', 'app.b.Gamma', 'app.c.Leaf'];

  it('reports a package cycle and a class cycle with the exception route', () => {
    const result = findings(modules, [
      edge('app.a.Alpha', 'app.b.Beta'),
      edge('app.b.Beta', 'app.a.Alpha'),
      edge('app.b.Gamma', 'app.c.Leaf'),
    ]);

    expect(result.map((finding) => `${finding.rule} ${finding.path}`)).toEqual([
      'package-cycle src/main/java/app/a/Alpha.java',
      'class-cycle src/main/java/app/a/Alpha.java',
    ]);
    expect(result[0].message).toBe(
      'Packages app.a, app.b depend on each other. Move the shared types down into one of them, or invert one dependency behind an interface. If it is right here, add an exception for coupling/package-cycle in nitpicker.config.json.',
    );
    expect(result[1].message).toBe(
      'Classes app.a.Alpha, app.b.Beta depend on each other. Break the loop: pass what is needed as a parameter, or invert one dependency behind an interface. If it is right here, add an exception for coupling/class-cycle in nitpicker.config.json.',
    );
    expect(result.every((finding) => finding.classification === 'enforceable')).toBe(true);
    expect(() => parseAnalyzerReport({ findings: result }, 'java')).not.toThrow();
  });

  it('reports a package cycle that no class cycle explains', () => {
    const result = findings(modules, [
      edge('app.a.Alpha', 'app.b.Beta'),
      edge('app.b.Gamma', 'app.a.Alpha'),
    ]);

    expect(result.map((finding) => finding.rule)).toEqual(['package-cycle']);
  });

  it('is quiet for a layered graph and for edges to classes outside the project', () => {
    const result = findings(modules, [
      edge('app.a.Alpha', 'app.b.Beta'),
      edge('app.b.Beta', 'app.c.Leaf'),
      edge('app.c.Leaf', 'org.other.Library'),
    ]);

    expect(result).toEqual([]);
  });

  it('gives the same identity however the edges are ordered, and a new one when the loop grows', () => {
    const loop = [edge('app.a.Alpha', 'app.b.Beta'), edge('app.b.Beta', 'app.a.Alpha')];
    const forward = findings(modules, loop);
    const backward = findings(modules, [...loop].reverse());
    const grown = findings(modules, [
      ...loop,
      edge('app.b.Beta', 'app.c.Leaf'),
      edge('app.c.Leaf', 'app.a.Alpha'),
    ]);

    expect(forward.map((finding) => finding.identity)).toEqual(
      backward.map((finding) => finding.identity),
    );
    expect(grown[0].identity).not.toBe(forward[0].identity);
  });

  it('lists five members and counts the rest', () => {
    const many = Array.from({ length: 8 }, (_, index) => `app.p${String(index)}.C`);
    const ring = many.map((name, index) => edge(name, many[(index + 1) % many.length]));

    const [first] = findings(many, ring);

    expect(first.message).toBe(
      'Packages app.p0, app.p1, app.p2, app.p3, app.p4 and 3 more depend on each other. ' +
        'Move the shared types down into one of them, or invert one dependency behind an interface. ' +
        'If it is right here, add an exception for coupling/package-cycle in nitpicker.config.json.',
    );
  });
});
