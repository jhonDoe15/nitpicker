import { describe, expect, it } from 'vitest';
import { withoutMainMethodFindings } from './main-method.mjs';

const SOURCE = `package demo;

public class Cli {
  private final PrintStream out;

  void run(String[] args) {
    System.out.println("run");
    out.println(args.length > 0 ? "x" : "y");
  }

  public static void main(final String... args) throws Exception {
    new Cli(System.out).run(args);
    try {
      System.out.println("done");
    } catch (RuntimeException e) {
      e.printStackTrace();
    }
  }

  static void main(int count) {
    System.out.println(count);
  }

  void other() {
    System.err.println("late");
  }
}
`;
const finding = (tool, rule, line, path = 'src/main/java/demo/Cli.java') => ({
  tool,
  rule,
  path,
  location: { line },
});
const kept = (findings, source = SOURCE) =>
  withoutMainMethodFindings(findings, (file) => (file.endsWith('.java') ? source : undefined)).map(
    (item) => `${item.tool}/${item.rule}:${String(item.location.line)}`,
  );

describe('withoutMainMethodFindings', () => {
  it('drops standard stream and no-coverage mutant findings inside the body of main only', () => {
    expect(
      kept([
        finding('errorprone', 'SystemOut', 7),
        finding('errorprone', 'SystemOut', 12),
        finding('pmd', 'SystemPrintln', 14),
        finding('pmd', 'SystemPrintln', 21),
        finding('pmd', 'SystemPrintln', 25),
        finding('jacoco', 'changed-branch-coverage', 12),
        finding('pit', 'mutant-nocoverage', 13),
        finding('pit', 'mutant-nocoverage', 25),
      ]),
    ).toStrictEqual([
      'errorprone/SystemOut:7',
      'pmd/SystemPrintln:21',
      'pmd/SystemPrintln:25',
      'jacoco/changed-branch-coverage:12',
      'pit/mutant-nocoverage:25',
    ]);
  });

  it('keeps printStackTrace and the mutants of a main that tests run', () => {
    expect(
      kept([
        finding('errorprone', 'SystemOut', 16),
        finding('pit', 'mutant-survived', 12),
        finding('pmd', 'AvoidPrintStackTrace', 16),
      ]),
    ).toStrictEqual([
      'errorprone/SystemOut:16',
      'pit/mutant-survived:12',
      'pmd/AvoidPrintStackTrace:16',
    ]);
  });

  it('leaves findings without a line, a Java source or a readable file alone', () => {
    const findings = [
      { tool: 'errorprone', rule: 'SystemOut', path: 'src/main/java/demo/Cli.java' },
      finding('errorprone', 'SystemOut', 12, 'src/main/kotlin/demo/Cli.kt'),
      finding('errorprone', 'SystemOut', 12, 'src/main/java/demo/Gone.java'),
    ];

    expect(
      withoutMainMethodFindings(findings, (file) =>
        file.endsWith('Cli.java') ? SOURCE : undefined,
      ),
    ).toStrictEqual(findings);
  });
});
