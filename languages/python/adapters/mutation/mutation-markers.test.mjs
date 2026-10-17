import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mutationMarkerFindings } from './mutation-markers.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function context(files) {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-mutation-markers-'));
  roots.push(projectRoot);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), text);
  }
  return { projectRoot, project: { sourceRoots: ['src'] } };
}

const SOURCE =
  'X = 1  # pragma: no mutate\n\n\ndef f():  # pragma: no mutate function\n    return X\n';

describe('code hidden from mutmut', () => {
  it('reports each pragma: no mutate in production code at its line', () => {
    const findings = mutationMarkerFindings(
      context({ 'src/app/a.py': SOURCE, 'tests/test_a.py': 'X = 1  # pragma: no mutate\n' }),
    );

    expect(
      findings.map(({ tool, rule, path: file, location, classification }) => [
        tool,
        rule,
        file,
        location.line,
        classification,
      ]),
    ).toEqual([
      ['mutmut', 'mutant-ignored', 'src/app/a.py', 1, 'enforceable'],
      ['mutmut', 'mutant-ignored', 'src/app/a.py', 4, 'enforceable'],
    ]);
    expect(findings[1].message).toBe(
      '`# pragma: no mutate function` hides this function from mutation testing. Remove it and test the code. Ignore comments and patterns are not an exception route.',
    );
  });
  it('reports production files the project do_not_mutate patterns hide, and mutate_only_covered_lines', () => {
    const findings = mutationMarkerFindings(
      context({
        'src/app/a.py': 'X = 1\n',
        'src/app/generated/b.py': 'Y = 2\n',
        'pyproject.toml':
          '[tool.mutmut]\ndo_not_mutate = ["*/tests/*", "src/app/generated/*"]\nmutate_only_covered_lines = true\n',
      }),
    );

    expect(findings.map(({ path: file, identity, message }) => [file, identity, message])).toEqual([
      [
        'src/app/generated/b.py',
        'do-not-mutate:src/app/generated/*',
        'do_not_mutate pattern "src/app/generated/*" in [tool.mutmut] of pyproject.toml hides this file from mutation testing. Remove it and test the code. Ignore comments and patterns are not an exception route.',
      ],
      [
        'pyproject.toml',
        'mutate-only-covered-lines',
        'mutate_only_covered_lines in [tool.mutmut] of pyproject.toml hides the code no test runs from mutation testing. Remove it and test the code. Ignore comments and patterns are not an exception route.',
      ],
    ]);
  });
  it('reads the setup.cfg [mutmut] section too', () => {
    const findings = mutationMarkerFindings(
      context({
        'src/app/a.py': 'X = 1\n',
        'setup.cfg': '[mutmut]\ndo_not_mutate =\n    src/app/a.py\n',
      }),
    );

    expect(findings.map(({ path: file }) => file)).toEqual(['src/app/a.py']);
  });
});
