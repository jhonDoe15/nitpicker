import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { cycleFindings, cyclicComponents } from './cycles.mjs';

const packageOf = (name) => name.slice(0, name.lastIndexOf('.'));
const fileOf = (name) => `src/main/java/${name.replaceAll('.', '/')}.java`;
const edge = (source, target) => ({ source, target });
const findings = (modules, edges) =>
  cycleFindings({ modules, edges, packageOf, fileOf }, 'coupling');
const identities = (result) => result.map((finding) => finding.identity);

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

  it('leaves out a node between two loops that belongs to neither', () => {
    const components = cyclicComponents(
      ['a', 'b', 'm', 'x', 'y'],
      [
        edge('a', 'b'),
        edge('b', 'a'),
        edge('b', 'm'),
        edge('m', 'x'),
        edge('x', 'y'),
        edge('y', 'x'),
      ],
    );

    expect(components).toEqual([
      ['a', 'b'],
      ['x', 'y'],
    ]);
  });

  it('reports one component for a long ring', () => {
    const nodes = ['n1', 'n2', 'n3', 'n4', 'n5'];
    const ring = nodes.map((node, index) => edge(node, nodes[(index + 1) % nodes.length]));

    expect(cyclicComponents(nodes, ring)).toEqual([nodes]);
  });

  it('handles a graph without loops', () => {
    expect(cyclicComponents(['a', 'b', 'c'], [edge('a', 'b'), edge('b', 'c')])).toEqual([]);
  });

  it('finds a ring of twenty thousand nodes', () => {
    const nodes = Array.from({ length: 20_000 }, (_, index) => `n${String(index)}`);
    const chain = nodes.map((node, index) => edge(node, nodes[(index + 1) % nodes.length]));

    expect(cyclicComponents(nodes, chain).map((component) => component.length)).toEqual([20_000]);
  });
});

describe('cycleFindings', () => {
  const modules = ['app.a.Alpha', 'app.b.Beta', 'app.b.Gamma', 'app.c.Leaf'];
  const loop = [edge('app.a.Alpha', 'app.b.Beta'), edge('app.b.Beta', 'app.a.Alpha')];

  it('reports each package of a cycle once', () => {
    const result = findings(modules, [...loop, edge('app.b.Gamma', 'app.c.Leaf')]);

    expect(result).toEqual([
      {
        tool: 'coupling',
        rule: 'package-cycle',
        path: 'src/main/java/app/a/Alpha.java',
        identity: 'cycle:app.a',
        classification: 'enforceable',
        message:
          'Package app.a is in a dependency cycle with app.b. ' +
          'Move the shared types down into one of them, or invert one dependency behind an interface.',
      },
      {
        tool: 'coupling',
        rule: 'package-cycle',
        path: 'src/main/java/app/b/Beta.java',
        identity: 'cycle:app.b',
        classification: 'enforceable',
        message:
          'Package app.b is in a dependency cycle with app.a. ' +
          'Move the shared types down into one of them, or invert one dependency behind an interface.',
      },
    ]);
    expect(() => parseAnalyzerReport({ findings: result }, 'java')).not.toThrow();
  });

  it('is quiet for a class loop inside one package, a layered graph and outside classes', () => {
    const result = findings(modules, [
      edge('app.b.Beta', 'app.b.Gamma'),
      edge('app.b.Gamma', 'app.b.Beta'),
      edge('app.a.Alpha', 'app.b.Beta'),
      edge('app.b.Beta', 'app.c.Leaf'),
      edge('app.c.Leaf', 'org.other.Library'),
    ]);

    expect(result).toEqual([]);
  });

  it('keeps the identity of each member when the cycle grows or shrinks', () => {
    const grown = findings(modules, [
      ...loop,
      edge('app.b.Beta', 'app.c.Leaf'),
      edge('app.c.Leaf', 'app.a.Alpha'),
    ]);

    expect(identities(findings(modules, [...loop].reverse()))).toEqual(
      identities(findings(modules, loop)),
    );
    expect(identities(grown)).toEqual(['cycle:app.a', 'cycle:app.b', 'cycle:app.c']);
  });

  it('lists five other members and counts the rest', () => {
    const many = Array.from({ length: 8 }, (_, index) => `app.p${String(index)}.C`);
    const ring = many.map((name, index) => edge(name, many[(index + 1) % many.length]));

    const [first] = findings(many, ring);

    expect(first.message).toBe(
      'Package app.p0 is in a dependency cycle with app.p1, app.p2, app.p3, app.p4, app.p5 and 2 more. ' +
        'Move the shared types down into one of them, or invert one dependency behind an interface.',
    );
  });
});
