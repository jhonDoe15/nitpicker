import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../core/diff/finding-schema.mjs';
import { analyzeJavaCoupling, parseJdeps, readCouplingFindings } from './java-coupling.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

// client.A and client.B use stable.S; stable.S uses churn.U (a package less stable than its
// user), which uses leaf.L. Nested classes fold into their top-level class.
const CLASSES = [
  'client.A',
  'client.B',
  'client.C',
  'stable.S',
  'stable.S$Helper',
  'churn.U',
  'leaf.L',
  'Main',
];
const JDEPS = `classes -> java.base
classes -> classes
   client.A                  -> java.lang.Object                                   java.base
   client.A                  -> stable.S                                           classes
   client.B                  -> stable.S                                           classes
   client.C                  -> stable.S                                           classes
   client.B                  -> client.A                                           classes
   stable.S                  -> churn.U                                            classes
   stable.S                  -> stable.S$Helper                                    classes
   stable.S$Helper           -> leaf.L                                             classes
   churn.U                   -> leaf.L                                             classes
   churn.U                   -> org.other.Library                                  not found
   leaf.L                    -> java.lang.String                                   java.base
   Main                      -> client.A                                           classes
`;

const fileOf = (name) => `src/main/java/${name.replaceAll('.', '/')}.java`;
const analyze = () => analyzeJavaCoupling({ classes: CLASSES, edges: parseJdeps(JDEPS), fileOf });
const packageOf = (report, name) => report.packages.find((entry) => entry.name === name);

describe('parseJdeps', () => {
  it('reads class edges and skips the headers', () => {
    const edges = parseJdeps(JDEPS);

    expect(edges).toHaveLength(12);
    expect(edges[0]).toEqual({ source: 'client.A', target: 'java.lang.Object' });
    expect(edges.some((edge) => edge.source === 'classes')).toBe(false);
  });
});

describe('analyzeJavaCoupling', () => {
  it('counts distinct files across the graph of main classes only', () => {
    const report = analyze();

    expect(report.summary).toEqual({ modules: 7, dependencies: 8, packages: 5 });
    const stableS = report.modules.find((entry) => entry.file.endsWith('/stable/S.java'));
    expect(stableS).toMatchObject({ fanIn: 3, fanOut: 2, totalCoupling: 5, instability: 0.4 });
    expect(report.modules.find((entry) => entry.file.endsWith('/Main.java'))).toMatchObject({
      fanIn: 0,
      fanOut: 1,
      instability: 1,
    });
  });

  it('computes package fan-in, fan-out and instability from files outside the package', () => {
    const report = analyze();

    expect(packageOf(report, 'client')).toMatchObject({
      modules: 3,
      fanIn: 1,
      fanOut: 1,
      instability: 0.5,
      cohesion: { internalEdges: 1, edgeDensity: 0.1667, connectedComponents: 2 },
    });
    expect(packageOf(report, 'stable')).toMatchObject({ fanIn: 3, fanOut: 2, instability: 0.4 });
    expect(packageOf(report, 'churn')).toMatchObject({ fanIn: 1, fanOut: 1, instability: 0.5 });
    expect(packageOf(report, 'leaf')).toMatchObject({ fanIn: 2, fanOut: 0, instability: 0 });
    expect(packageOf(report, '(root)')).toMatchObject({ fanIn: 0, fanOut: 1, instability: 1 });
  });

  it('lists package edges that point at a less stable package', () => {
    expect(analyze().stabilityDirection).toEqual([
      { source: 'stable', target: 'churn', delta: 0.1 },
    ]);
  });
});

describe('readCouplingFindings', () => {
  function reportsWith(files) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-coupling-'));
    temporaryRoots.push(root);
    const reportRoot = path.join(root, 'build/nitpicker');
    mkdirSync(reportRoot, { recursive: true });
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(path.join(reportRoot, name), text);
    }
    return { root, reportRoot };
  }

  it('reports nothing when jdeps did not run', () => {
    const { root, reportRoot } = reportsWith({});

    expect(
      readCouplingFindings(reportRoot, { projectRoot: root, sourceRoots: ['src/main/java'] }),
    ).toEqual([]);
  });

  it('runs the shared rule: report-only metrics and an enforceable stability-direction', () => {
    const { root, reportRoot } = reportsWith({
      'jdeps.txt': JDEPS,
      'jdeps-classes.txt': `${CLASSES.join('\n')}\n`,
    });

    const findings = readCouplingFindings(reportRoot, {
      projectRoot: root,
      sourceRoots: ['src/main/java'],
    });

    expect(() => parseAnalyzerReport({ findings }, 'coupling')).not.toThrow();
    const enforceable = findings.filter((finding) => finding.classification === 'enforceable');
    expect(enforceable).toEqual([
      {
        tool: 'coupling',
        rule: 'stability-direction',
        path: '.',
        identity: 'package-edge:stable->churn',
        message: 'stable depends on less stable package churn',
        classification: 'enforceable',
      },
    ]);
    expect(findings.filter((finding) => finding.classification !== 'enforceable')).not.toHaveLength(
      0,
    );
    expect(
      findings.find((finding) => finding.identity === 'package:stable:instability').metric,
    ).toEqual({ name: 'instability', value: 0.4 });
    expect(
      findings.find(
        (finding) =>
          finding.rule === 'module-coupling' && finding.path === 'src/main/java/stable/S.java',
      ),
    ).toBeDefined();
  });
});
