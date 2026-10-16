import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import {
  cpdClones,
  isAccessorOnly,
  isDataTable,
  readCpdFindings,
  tokenShape,
} from './cpd-duplicates.mjs';

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
    ([file, start, end, columns = '']) =>
      `    <file path="${file}" line="${String(start)}" endline="${String(end)}"${columns} ` +
      'begintoken="0" endtoken="9"/>',
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

  it('treats constant collections built from literals as data', () => {
    const entries =
      'static final Map<String, Integer> CODES = Map.ofEntries(\n  entry("AT", 43),\n  Map.entry("BE", 32));';
    const list = 'private static final List<String> NAMES = List.of(\n  "ada",\n  "bob");';
    const computed = 'static final List<String> NAMES = List.of(\n  load(name),\n  "bob");';

    expect([entries, list, computed].map((fragment) => isDataTable(fragment))).toEqual([
      true,
      true,
      false,
    ]);
  });
});

describe('cpdClones', () => {
  it('pairs the first file by path with each other file and reads the source text', () => {
    const { root } = project({ [MAIN_A]: sourceWith('A'), [MAIN_B]: sourceWith('B') });
    const sides = [
      [MAIN_A, 2, 4],
      [MAIN_B, 2, 4],
      [TEST_A, 1, 3],
    ];
    const fragment = '  int run(int rate) {\n    int total = 0;\n    total += compute(0) * rate;';
    const clone = (second) => ({
      first: { file: MAIN_A, line: 2, endLine: 4 },
      second,
      fragment,
      shape: tokenShape(fragment),
      lines: 7,
      tokens: 120,
    });
    const expected = [
      clone({ file: MAIN_B, line: 2, endLine: 4 }),
      clone({ file: TEST_A, line: 1, endLine: 3 }),
    ];

    expect(cpdClones(report(duplication(7, sides)), root)).toEqual(expected);
    expect(cpdClones(report(duplication(7, sides.toReversed())), root)).toEqual(expected);
  });

  it('reads the columns CPD reports and shapes the text by its tokens alone', () => {
    const text = 'int a = 1; if (b) {\n  call("x;", \'}\', 2.5e-3, a.b); // done\n} c();\n';
    const { root } = project({ [MAIN_A]: text, [MAIN_B]: text });
    const columns = ' column="12" endcolumn="2"';
    const xml = report(
      duplication(3, [
        [MAIN_B, 1, 3, columns],
        [MAIN_A, 1, 3, columns],
      ]),
    );

    const [clone] = cpdClones(xml, root);

    expect(clone.first).toEqual({ file: MAIN_A, line: 1, endLine: 3, column: 12, endColumn: 2 });
    expect(clone.shape).toBe('(){(,,,.);}');
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
        identity: expect.stringMatching(/^cpd:pair:/),
        location: { line: 2 },
        classification: 'enforceable',
        message:
          `This code repeats ${MAIN_B}:2 (8 lines). Keep one copy and call it from both places. ` +
          'If it is right here, add an exception for duplicates/duplicate-clone in nitpicker.config.json.',
      },
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('keeps the identities when a literal or a name in a copy changes or CPD lists the files the other way', () => {
    const identities = (files, order) => {
      const { root, reportRoot } = project(files);
      const sides = [MAIN_A, MAIN_B, TEST_A].map((file) => [
        file,
        2,
        9,
        ' column="3" endcolumn="6"',
      ]);
      writeFileSync(path.join(reportRoot, 'cpd.xml'), report(duplication(8, order(sides))));
      return readCpdFindings(reportRoot, options(root)).map((finding) => finding.identity);
    };
    const base = {
      [MAIN_A]: sourceWith('A'),
      [MAIN_B]: sourceWith('B'),
      [TEST_A]: sourceWith('C'),
    };
    const edited = {
      ...base,
      [MAIN_A]: sourceWith('A').replace('compute(3)', 'compute(30)').replace('rate)', 'factor)'),
    };

    const before = identities(base, (sides) => sides);

    expect(before).toHaveLength(2);
    expect(new Set(before).size).toBe(2);
    expect(identities(edited, (sides) => sides)).toEqual(before);
    expect(identities(edited, (sides) => sides.toReversed())).toEqual(before);
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
      `This code repeats ${TEST_B}:2 (8 lines). Extract a helper, or fold the cases into one @ParameterizedTest. Keep one copy and call it from both places. ` +
        'If it is right here, add an exception for duplicates/duplicate-clone in nitpicker.config.json.',
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

  const NPE =
    '[main] ERROR net.sourceforge.pmd.cli - Exception while running CPD: Cannot invoke ' +
    '"String.equals(Object)" because "java.util.Deque.peek().name" is null';

  const moduleRoots = { sourceRoots: ['core/src/main/java'], testRoots: ['core/src/test/java'] };

  function notRun(reason) {
    return [
      {
        tool: 'duplicates',
        rule: 'cpd-not-run',
        path: '.',
        identity: 'cpd-not-run',
        message:
          'No CPD duplicate report for this module, so duplicated code in core/src/main/java, ' +
          `core/src/test/java was not checked: ${reason}`,
        classification: 'descriptive',
        toolNotRun: true,
        notRunScope: ['core/src/main/java', 'core/src/test/java'],
      },
    ];
  }

  it.each([
    [
      'a crash that exited 0',
      `0\nPicked up JAVA_TOOL_OPTIONS: -Dx=y\n${NPE}\n`,
      `PMD CPD exited with code 0 and wrote no report: ${NPE}`,
    ],
    [
      'a failure without error output',
      '1\n',
      'PMD CPD exited with code 1 and wrote no report: no error output',
    ],
    [
      'a launcher that timed out',
      'ETIMEDOUT\nspawnSync java ETIMEDOUT',
      'PMD CPD did not finish within the tool timeout and wrote no report: spawnSync java ETIMEDOUT',
    ],
    [
      'a launcher killed by a signal',
      'SIGKILL\n',
      'PMD CPD was stopped by SIGKILL and wrote no report: no error output',
    ],
    [
      'a java that could not start',
      'EACCES\nspawnSync /jdk/bin/java EACCES',
      'PMD CPD could not run (EACCES) and wrote no report: spawnSync /jdk/bin/java EACCES',
    ],
  ])('reports %s as CPD not run, naming the exit code and stderr', (_, failure, reason) => {
    const { root, reportRoot } = project({});
    writeFileSync(path.join(reportRoot, 'cpd-failed.txt'), failure);

    const findings = readCpdFindings(reportRoot, { projectRoot: root, ...moduleRoots });

    expect(findings).toEqual(notRun(reason));
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it.each([
    ['', 'PMD CPD wrote an empty cpd.xml'],
    ['  \n', 'PMD CPD wrote an empty cpd.xml'],
    ['Exception in thread "main"', 'PMD CPD wrote a non-XML cpd.xml'],
  ])('reports a cpd.xml of %j as CPD not run', (content, reason) => {
    const { root, reportRoot } = project({});
    writeFileSync(path.join(reportRoot, 'cpd.xml'), content);

    expect(readCpdFindings(reportRoot, { projectRoot: root, ...moduleRoots })).toEqual(
      notRun(reason),
    );
  });

  it('reports the paths CPD could not read next to its clones', () => {
    const { root, reportRoot } = project({});
    writeFileSync(path.join(reportRoot, 'cpd.xml'), report());
    writeFileSync(
      path.join(reportRoot, 'cpd-skipped.txt'),
      `${path.join(root, 'src/main/java/loop')}: symbolic link loop\n` +
        `${path.join(root, 'src/test/java')}: java.nio.file.NoSuchFileException\n`,
    );

    const findings = readCpdFindings(reportRoot, options(root));

    expect(findings).toEqual([
      {
        tool: 'duplicates',
        rule: 'cpd-skipped-paths',
        path: '.',
        identity: 'cpd-skipped-paths',
        message:
          'CPD could not read 2 path(s), so duplicated code there was not checked: ' +
          'src/main/java/loop: symbolic link loop; src/test/java: java.nio.file.NoSuchFileException',
        classification: 'descriptive',
      },
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('scopes a notice whose source roots lie outside the project to the module folder', () => {
    const { root, reportRoot } = project({});
    writeFileSync(path.join(reportRoot, 'cpd-failed.txt'), '1\n');

    expect(
      readCpdFindings(reportRoot, {
        projectRoot: root,
        sourceRoots: ['../shared/src/main/java'],
        testRoots: [],
        moduleDir: 'app',
      }).map(({ notRunScope }) => notRunScope),
    ).toEqual([['app']]);
  });

  it('reports nothing when CPD did not run on the module', () => {
    const { root, reportRoot } = project({});

    expect(readCpdFindings(reportRoot, options(root))).toEqual([]);
  });

  it('scopes a module whose sources sit at its root to the whole module', () => {
    const { root, reportRoot } = project({});
    writeFileSync(path.join(reportRoot, 'cpd-failed.txt'), '1\n');

    expect(
      readCpdFindings(reportRoot, { projectRoot: root, sourceRoots: [''], testRoots: [''] }).map(
        ({ message, notRunScope }) => [message, notRunScope],
      ),
    ).toEqual([
      [
        'No CPD duplicate report for this module, so duplicated code in the module root was not ' +
          'checked: PMD CPD exited with code 1 and wrote no report: no error output',
        ['.'],
      ],
    ]);
  });
});
