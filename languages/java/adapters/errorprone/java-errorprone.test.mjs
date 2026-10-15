import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readErrorProneFindings } from './java-errorprone.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const checks = JSON.parse(
  readFileSync(path.join(packageRoot, 'languages/java/gradle/errorprone/checks.json'), 'utf8'),
);

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
  it('keeps diagnostics in the main and test source roots, as project-relative paths', () => {
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
        "Exception created but not thrown. Did you mean 'throw new X();'?",
      ],
    ]);
  });

  it('ends findings of checks that can hit intended code with the exceptions route, in the java preset only', () => {
    const { projectRoot, reportRoot } = reportRootWith((root) => [
      {
        file: path.join(root, 'src/main/java/demo/A.java'),
        line: 3,
        message: '[JdkObsolete] Stack is a nonstandard class',
      },
      diagnostic(path.join(root, 'src/main/java/demo/A.java')),
    ]);
    const read = (kotlin) =>
      readErrorProneFindings({
        reportRoot,
        roots: [projectRoot],
        lintedRoots: ['src'],
        kotlin,
      }).map((finding) => finding.message);

    expect(read(false)).toEqual([
      'Stack is a nonstandard class. If this is intended, add {"rule":"errorprone/JdkObsolete","paths":["src/main/java/demo/A.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      "Exception created but not thrown. Did you mean 'throw new X();'?",
    ]);
    expect(read(true)).toEqual([
      'Stack is a nonstandard class',
      "Exception created but not thrown. Did you mean 'throw new X();'?",
    ]);
  });

  it('reads no findings when the report is absent', () => {
    const { projectRoot, reportRoot } = reportRootWith();

    expect(
      readErrorProneFindings({ reportRoot, roots: [projectRoot], lintedRoots: ['src'] }),
    ).toEqual([]);
  });
});

describe('Error Prone check policy', () => {
  const documented = () => {
    const doc = readFileSync(path.join(packageRoot, 'docs/java-preset.md'), 'utf8');
    const section = doc.slice(doc.indexOf('### Checks that are off'));
    const table = section.slice(0, section.indexOf('\n\n', section.indexOf('| ---')));
    return [...table.matchAll(/^\| `(\w+)` +\| .+\|$/gm)].map(([, name]) => name);
  };

  it('documents a reason for every check it turns off, and documents no check it turns on', () => {
    const offList = documented();

    expect(checks.disable.filter((name) => !offList.includes(name))).toEqual([]);
    expect(offList.filter((name) => checks.enable.includes(name))).toEqual([]);
  });

  it('keeps each list sorted and free of repeats', () => {
    for (const list of [checks.enable, checks.disable]) {
      expect(list).toEqual([...new Set(list)].sort());
    }
  });
});
