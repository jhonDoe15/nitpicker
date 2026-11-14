import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { lintFindings } from '../typed/go-run-readers.mts';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-lint-'));
const projectRoot = path.join(root, 'project');
const reportRoot = path.join(root, 'reports');

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function findingsFor(entries: readonly object[]) {
  mkdirSync(path.join(projectRoot, 'util'), { recursive: true });
  mkdirSync(reportRoot, { recursive: true });
  writeFileSync(path.join(projectRoot, 'util', 'clamp.go'), 'package util\n\nfunc Clamp() {}\n');
  writeFileSync(
    path.join(reportRoot, 'lint.json'),
    JSON.stringify({ findings: entries, errors: [] }),
  );
  return lintFindings({ projectRoot, reportRoot }).map(({ rule, path: file, location }) => ({
    rule,
    file,
    line: fieldOf(location, 'line'),
  }));
}

function entry(tool: string, rule: string, line: number) {
  return {
    tool,
    rule,
    file: path.join(projectRoot, 'util', 'clamp.go'),
    line,
    column: 1,
    message: 'm',
  };
}

describe('lint findings on a package', () => {
  it('puts a package-name finding on the folder and keeps a line finding on its line', () => {
    expect(
      findingsFor([entry('go-rules', 'generic-package-name', 1), entry('staticcheck', 'S1003', 3)]),
    ).toEqual([
      { rule: 'generic-package-name', file: 'util', line: 1 },
      { rule: 'S1003', file: 'util/clamp.go', line: 3 },
    ]);
  });
});
