import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { cpdClones, isAccessorOnly, isDataTable, readCpdFindings } from './cpd-duplicates.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const duplication = (lines, files) => `
  <duplication lines="${String(lines)}" tokens="120">
${files
  .map(
    ([file, start, end]) =>
      `    <file path="${file}" line="${String(start)}" endline="${String(end)}" begintoken="0" endtoken="9"/>`,
  )
  .join('\n')}
    <codefragment><![CDATA[ignored]]></codefragment>
  </duplication>`;

const report = (...duplications) =>
  `<?xml version="1.0"?>\n<pmd-cpd>\n  <file path="x" totalNumberOfTokens="1"/>${duplications.join('')}\n</pmd-cpd>\n`;

const LOGIC = Array.from(
  { length: 12 },
  (_, index) => `    total += compute(${String(index)}) * rate;`,
).join('\n');
const sourceWith = (name) =>
  `class ${name} {\n  int run(int rate) {\n    int total = 0;\n${LOGIC}\n    return total;\n  }\n}\n`;

function project(files, { jscpd } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cpd-'));
  roots.push(root);
  const reportRoot = path.join(root, 'build/nitpicker');
  mkdirSync(reportRoot, { recursive: true });
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  if (jscpd !== undefined) {
    writeFileSync(path.join(reportRoot, 'duplicates.json'), JSON.stringify(jscpd));
  }
  return { root, reportRoot };
}

const MAIN_A = 'src/main/java/demo/A.java';
const MAIN_B = 'src/main/java/demo/B.java';
const TEST_A = 'src/test/java/demo/ATest.java';
const TEST_B = 'src/test/java/demo/BTest.java';
const options = (root) => ({ projectRoot: root, testRoots: ['src/test/java'] });

describe('isAccessorOnly', () => {
  it('treats getters, setters, fields and constructors that only assign as boilerplate', () => {
    const entity = `@Entity
public class Customer {
  @Id
  private Long id;
  private String name;
  public Customer(Long id, String name) {
    this.id = id;
    this.name = name;
  }
  public Long getId() {
    return this.id;
  }
  public void setName(String name) {
    this.name = name;
  }
}`;

    expect(isAccessorOnly(entity)).toBe(true);
  });

  it('does not treat branching, calls or computed returns as boilerplate', () => {
    expect(isAccessorOnly('public int f(int a) {\n  if (a > 1) {\n    return a;\n  }\n}')).toBe(
      false,
    );
    expect(isAccessorOnly('public int f(int a) {\n  return a + 1;\n}')).toBe(false);
    expect(isAccessorOnly('public void f() {\n  run();\n}')).toBe(false);
    expect(isAccessorOnly('public void f() {\n  return;\n}')).toBe(false);
  });
});

describe('isDataTable', () => {
  it('treats enum constants and argument rows as data, and logic as code', () => {
    const constants =
      'enum Country {\n  AT("Austria", 43),\n  BE("Belgium", 32),\n  CH("Switzerland", 41);';
    const rows = 'Arguments.of("a", 1, true),\nArguments.of("b", 2, false),\n{"c", 3},';

    expect(isDataTable(constants)).toBe(true);
    expect(isDataTable(rows)).toBe(true);
    expect(isDataTable(LOGIC)).toBe(false);
  });
});

describe('cpdClones', () => {
  it('pairs the first file of a clone with each other file and reads the source text', () => {
    const { root } = project({ [MAIN_A]: sourceWith('A'), [MAIN_B]: sourceWith('B') });
    const xml = report(
      duplication(7, [
        [MAIN_A, 2, 4],
        [MAIN_B, 2, 4],
        [TEST_A, 1, 3],
      ]),
    );

    const clones = cpdClones(xml, root);

    expect(clones).toHaveLength(2);
    expect(clones[0].first).toEqual({ file: MAIN_A, line: 2, endLine: 4 });
    expect(clones[1].second.file).toBe(TEST_A);
    expect(clones[0].fragment).toBe(
      '  int run(int rate) {\n    int total = 0;\n    total += compute(0) * rate;',
    );
    expect(clones[0].lines).toBe(7);
  });
});

describe('readCpdFindings', () => {
  it('reports a renamed copy as a duplicate-clone with the usual message', () => {
    const { root, reportRoot } = project({ [MAIN_A]: sourceWith('A'), [MAIN_B]: sourceWith('B') });
    writeFileSync(
      path.join(reportRoot, 'cpd.xml'),
      report(
        duplication(8, [
          [path.join(root, MAIN_A), 2, 9],
          [path.join(root, MAIN_B), 2, 9],
        ]),
      ),
    );

    const findings = readCpdFindings(reportRoot, options(root));

    expect(findings).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: MAIN_A,
        identity: expect.any(String),
        location: { line: 2 },
        classification: 'enforceable',
        message: `This code repeats ${MAIN_B}:2 (8 lines). Keep one copy and call it from both places.`,
      },
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('points test clones at a helper or a parameterized test', () => {
    const { root, reportRoot } = project({
      [TEST_A]: sourceWith('ATest'),
      [TEST_B]: sourceWith('BTest'),
    });
    writeFileSync(
      path.join(reportRoot, 'cpd.xml'),
      report(
        duplication(8, [
          [TEST_A, 2, 9],
          [TEST_B, 2, 9],
        ]),
      ),
    );

    const [finding] = readCpdFindings(reportRoot, options(root));

    expect(finding.message).toBe(
      `This code repeats ${TEST_B}:2 (8 lines). Extract a helper, or fold the cases into one @ParameterizedTest. Keep one copy and call it from both places.`,
    );
  });

  it('skips a clone the exact-match duplicate report already has, in either order', () => {
    const jscpd = (first, second) => ({
      runs: [
        {
          root: '.',
          report: {
            duplicates: [
              {
                firstFile: { name: first, start: 3 },
                secondFile: { name: second, start: 3 },
                lines: 6,
                tokens: 80,
              },
            ],
          },
        },
      ],
    });
    const files = { [MAIN_A]: sourceWith('A'), [MAIN_B]: sourceWith('B') };
    const cpd = report(
      duplication(8, [
        [MAIN_A, 2, 9],
        [MAIN_B, 2, 9],
      ]),
    );

    for (const known of [jscpd(MAIN_A, MAIN_B), jscpd(MAIN_B, MAIN_A)]) {
      const { root, reportRoot } = project(files, { jscpd: known });
      writeFileSync(path.join(reportRoot, 'cpd.xml'), cpd);
      expect(readCpdFindings(reportRoot, options(root))).toEqual([]);
    }
  });

  it('keeps a clone the exact-match report has in other places', () => {
    const { root, reportRoot } = project(
      { [MAIN_A]: sourceWith('A'), [MAIN_B]: sourceWith('B') },
      {
        jscpd: {
          runs: [
            {
              root: '.',
              report: {
                duplicates: [
                  {
                    firstFile: { name: MAIN_A, start: 40 },
                    secondFile: { name: MAIN_B, start: 40 },
                    lines: 6,
                    tokens: 80,
                  },
                ],
              },
            },
          ],
        },
      },
    );
    writeFileSync(
      path.join(reportRoot, 'cpd.xml'),
      report(
        duplication(8, [
          [MAIN_A, 2, 9],
          [MAIN_B, 2, 9],
        ]),
      ),
    );

    expect(readCpdFindings(reportRoot, options(root))).toHaveLength(1);
  });

  it('skips accessor-only clones and a missing report', () => {
    const accessors = 'class P {\n  private int a;\n  public int getA() {\n    return a;\n  }\n}\n';
    const { root, reportRoot } = project({ [MAIN_A]: accessors, [MAIN_B]: accessors });
    writeFileSync(
      path.join(reportRoot, 'cpd.xml'),
      report(
        duplication(6, [
          [MAIN_A, 1, 6],
          [MAIN_B, 1, 6],
        ]),
      ),
    );

    expect(readCpdFindings(reportRoot, options(root))).toEqual([]);
    expect(readCpdFindings(path.join(root, 'nothing'), options(root))).toEqual([]);
  });

  it('reports overlapping windows of one file pair once and drops a copy of itself', () => {
    const { root, reportRoot } = project({ [MAIN_A]: sourceWith('A'), [MAIN_B]: sourceWith('B') });
    writeFileSync(
      path.join(reportRoot, 'cpd.xml'),
      report(
        duplication(8, [
          [MAIN_A, 2, 9],
          [MAIN_B, 2, 9],
        ]),
        duplication(8, [
          [MAIN_A, 3, 10],
          [MAIN_B, 3, 10],
        ]),
        duplication(6, [
          [MAIN_A, 3, 8],
          [MAIN_A, 5, 10],
        ]),
      ),
    );

    const findings = readCpdFindings(reportRoot, options(root));

    expect(findings.map((finding) => [finding.path, finding.location])).toEqual([
      [MAIN_A, { line: 2 }],
    ]);
  });

  it('skips enum tables and keeps a clone whose source it cannot read', () => {
    const table = Array.from(
      { length: 12 },
      (_, index) => `  C${String(index)}("n${String(index)}", ${String(index)}),`,
    );
    const enumWith = (name) => `enum ${name} {\n${table.join('\n')}\n  ;\n}\n`;
    const { root, reportRoot } = project({ [MAIN_A]: enumWith('A'), [MAIN_B]: enumWith('B') });
    writeFileSync(
      path.join(reportRoot, 'cpd.xml'),
      report(
        duplication(12, [
          [MAIN_A, 2, 13],
          [MAIN_B, 2, 13],
        ]),
        duplication(8, [
          ['src/main/java/demo/Gone.java', 2, 9],
          ['src/main/java/demo/Lost.java', 2, 9],
        ]),
      ),
    );

    const findings = readCpdFindings(reportRoot, options(root));

    expect(findings.map((finding) => finding.path)).toEqual(['src/main/java/demo/Gone.java']);
  });
});
