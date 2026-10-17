import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readPinnedTools } from '../../builds/java-build.mjs';
import { readCpdFindings } from '../../guards/cpd-duplicates.mjs';
import { runCpd } from './maven-pmd.mjs';
import { resolveTools } from '../maven-tools.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../../adapters/test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const maven = process.env.NITPICKER_MAVEN;
const temporary = [];
afterAll(() => {
  for (const root of temporary) rmSync(root, { recursive: true, force: true });
});

const CLASS_LITERAL_THEN_ENUM =
  '  static final Class<?>[] TYPES = {String.class};\n  enum Kind { X }\n  void register() {}\n' +
  '  char c = \'x\';\n  String s = "done";\n';
const BOM = String.fromCodePoint(0xfeff);
const FIELDS = Array.from({ length: 12 }, (_, index) => `  private int f${String(index)};\n`).join(
  '',
);

function registry(body = '') {
  return `package p;\npublic class Reg {\n${body}${CLASS_LITERAL_THEN_ENUM}}\n`;
}

const CPD_SCENARIOS = [
  [
    'a 1600-character string literal',
    registry(`  static final String B64 = "${'QUJD'.repeat(400)}";\n`),
  ],
  [
    'a 12 KB text block',
    registry(
      `  static final String SQL = """\n${'      select * from t where a = b\n'.repeat(400)}      """;\n`,
    ),
  ],
  ['20000 blank lines', registry(`  int a${'\n'.repeat(20_000)}  = 1;\n`)],
  [
    'a text block holding an apostrophe',
    registry('  String json = """\n      {"name": "O\'Brien"}\n      """;\n'),
  ],
  [
    'a text block holding one double quote',
    registry('  String size = """\n      a 5" screen\n      """;\n'),
  ],
  [
    'a line comment between a type and .class',
    registry('  Class<?>[] other = {String // why\n      .class};\n  enum Mode { Y }\n'),
  ],
  [
    'Unicode-escaped class literals',
    registry(
      '  Class<?>[] escaped = {String\\u002Eclass, String.\\u0063lass, String.clas\\u0073};\n' +
        '  enum Escaped { Z }\n',
    ),
  ],
  ['CRLF line endings', registry(FIELDS).replaceAll('\n', '\r\n')],
  ['a byte order mark', `${BOM}${registry(FIELDS)}`],
  ['a byte order mark and CRLF line endings', `${BOM}${registry(FIELDS).replaceAll('\n', '\r\n')}`],
];

const REPEATED_RUN = [
  'package p;',
  'public class A {',
  ...Array.from({ length: 12 }, (_, index) => `  Object f${String(index)} = java.util.Map.class;`),
  '  int run(int a, int b) {',
  ...Array.from({ length: 20 }, (_, index) => `    a = a + b * ${String(index)}; b = b - a;`),
  '    return a;',
  '  }',
  '}',
  '',
].join('\n');

function cpdOver(files, extraRoots = []) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-cpd-'));
  temporary.push(root);
  const sources = path.join(root, 'src/main/java');
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.join(sources, 'p'), { recursive: true });
    writeFileSync(path.join(sources, 'p', name), text);
  }
  const reportDir = path.join(root, 'target/nitpicker');
  mkdirSync(reportDir, { recursive: true });
  runCpd({
    module: {
      basedir: root,
      sourceRoots: [sources, ...extraRoots.map((extra) => path.join(sources, extra))],
      testSourceRoots: [],
    },
    reportDir,
    tools: resolveTools({ projectRoot: root, maven, pinned: readPinnedTools() }),
  });
  const report = path.join(reportDir, 'cpd.xml');
  return {
    outputs: readdirSync(reportDir).sort(),
    duplications: existsSync(report)
      ? readFileSync(report, 'utf8').split('<duplication ').length - 1
      : undefined,
    findings: readCpdFindings(reportDir, {
      projectRoot: root,
      sourceRoots: ['src/main/java'],
      testRoots: [],
    }),
  };
}

describe.skipIf(!enabled)('the PMD CPD launcher', () => {
  it.each(CPD_SCENARIOS)(
    'reports on a class literal before an enum after %s',
    (_, text) => {
      expect(cpdOver({ 'Reg.java': text })).toEqual({
        outputs: ['cpd.xml'],
        duplications: 0,
        findings: [],
      });
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'reads a file under two overlapping source roots once',
    () => {
      expect(cpdOver({ 'A.java': REPEATED_RUN }, ['p'])).toEqual(
        cpdOver({ 'A.java': REPEATED_RUN }),
      );
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'lists a file PMD cannot lex among the paths it skipped, after its class literals',
    () => {
      const result = cpdOver({
        'L.java': `package p;\npublic class L {\n${CLASS_LITERAL_THEN_ENUM}  # bad\n}\n`,
        'S.java': `package p;\npublic class S {\n  static final String B64 = "${'QUJD'.repeat(400)}";\n}\n`,
      });

      expect(result).toEqual({
        outputs: ['cpd.xml'],
        duplications: 0,
        findings: [
          {
            tool: 'duplicates',
            rule: 'cpd-skipped-paths',
            path: '.',
            identity: 'cpd-skipped-paths',
            message:
              'CPD could not read or tokenize 1 path(s), so duplicated code there was not checked: ' +
              "src/main/java/p/L.java: LexException: Lexical error in file 'src/main/java/p/L.java' " +
              'at line 8, column 3: "#" (35), after : "" (in lexical state DEFAULT)',
            classification: 'descriptive',
          },
        ],
      });
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
