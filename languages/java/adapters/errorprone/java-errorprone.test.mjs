import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readErrorProneFindings } from './java-errorprone.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function reportRootWith(diagnostics) {
  const projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-errorprone-')));
  roots.push(projectRoot);
  const reportRoot = path.join(projectRoot, 'build/nitpicker');
  mkdirSync(reportRoot, { recursive: true });
  if (diagnostics !== undefined) {
    writeFileSync(
      path.join(reportRoot, 'errorprone.json'),
      JSON.stringify(diagnostics(projectRoot)),
    );
  }
  return { projectRoot, reportRoot };
}

const diagnostic = (file) => ({
  file,
  line: 4,
  column: 9,
  kind: 'WARNING',
  message: "[DeadException] Exception created but not thrown\n  Did you mean 'throw new X();'?",
});

describe('readErrorProneFindings', () => {
  it('keeps main and test diagnostics as project-relative paths, with the route on every test finding', () => {
    const { projectRoot, reportRoot } = reportRootWith((root) => [
      diagnostic(path.join(root, 'src/main/java/demo/A.java')),
      diagnostic(path.join(root, 'src/test/java/demo/ATest.java')),
      diagnostic(path.join(root, 'build/nitpicker/errorprone/generated/main/demo/A_Impl.java')),
      diagnostic('/elsewhere/src/main/java/demo/B.java'),
    ]);

    const findings = readErrorProneFindings({
      reportRoot,
      roots: [projectRoot],
      lintedRoots: ['src/main/java', 'src/test/java'],
      manifest: { testSourceRoots: ['src/test/java'] },
    });

    expect(findings.map((finding) => [finding.rule, finding.path, finding.message])).toEqual([
      [
        'DeadException',
        'src/main/java/demo/A.java',
        "Exception created but not thrown. Did you mean 'throw new X();'?",
      ],
      [
        'DeadException',
        'src/test/java/demo/ATest.java',
        "Exception created but not thrown. Did you mean 'throw new X();'? If this is intended, add " +
          '{"rule":"errorprone/DeadException","paths":["src/test/java/demo/ATest.java"],"reason":"..."} ' +
          'to "exceptions" in nitpicker.config.json.',
      ],
    ]);
  });

  it('ends findings of checks that can hit intended code with the exceptions route', () => {
    const { projectRoot, reportRoot } = reportRootWith((root) => [
      {
        file: path.join(root, 'src/main/java/demo/A.java'),
        line: 3,
        message: '[JdkObsolete] Stack is a nonstandard class',
      },
      diagnostic(path.join(root, 'src/main/java/demo/A.java')),
    ]);

    const messages = readErrorProneFindings({
      reportRoot,
      roots: [projectRoot],
      lintedRoots: ['src'],
    }).map((finding) => finding.message);

    expect(messages).toEqual([
      'Stack is a nonstandard class. If this is intended, add {"rule":"errorprone/JdkObsolete","paths":["src/main/java/demo/A.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      "Exception created but not thrown. Did you mean 'throw new X();'?",
    ]);
  });

  it('gives the JDK form of a Guava suggestion where the source set has no Guava', () => {
    const { projectRoot, reportRoot } = reportRootWith((root) =>
      ['src/main/java/demo/A.java', 'src/test/java/demo/ATest.java'].map((file) => ({
        file: path.join(root, file),
        line: 4,
        message:
          "[ThrowSpecificExceptions] Throw something specific\n  Did you mean 'throw new VerifyException('?",
      })),
    );

    const findings = readErrorProneFindings({
      reportRoot,
      roots: [projectRoot],
      lintedRoots: ['src/main/java', 'src/test/java'],
      manifest: { testSourceRoots: ['src/test/java'], guava: false, testGuava: true },
    });

    expect(
      findings.map((finding) => finding.message.split(' If this is intended')[0]),
    ).toStrictEqual([
      "Throw something specific. Did you mean 'throw new IllegalStateException('?",
      "Throw something specific. Did you mean 'throw new VerifyException('?",
    ]);
  });

  it('drops what Lombok generates at its annotations and keeps the findings in written code', () => {
    const source = [
      'package demo;',
      'import lombok.*;',
      '@Data',
      'class A {',
      '  @Deprecated private int legacy() { return 1; }',
      '}',
    ].join('\n');
    const { projectRoot, reportRoot } = reportRootWith((root) => {
      const file = path.join(root, 'src/main/java/demo/A.java');
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, source);
      return [
        {
          file,
          line: 3,
          position: source.indexOf('@Data'),
          message: '[UnnecessarySemicolon] Unnecessary semicolon',
        },
        {
          file,
          line: 5,
          position: source.indexOf('@Deprecated'),
          message: '[MethodCanBeStatic] Can be static',
        },
      ];
    });

    const findings = readErrorProneFindings({
      reportRoot,
      roots: [projectRoot],
      lintedRoots: ['src/main/java'],
    });

    expect(findings.map((finding) => [finding.rule, finding.location.line])).toStrictEqual([
      ['MethodCanBeStatic', 5],
    ]);
  });

  it('reads no findings when the report is absent', () => {
    const { projectRoot, reportRoot } = reportRootWith();

    expect(
      readErrorProneFindings({ reportRoot, roots: [projectRoot], lintedRoots: ['src'] }),
    ).toEqual([]);
  });
});
