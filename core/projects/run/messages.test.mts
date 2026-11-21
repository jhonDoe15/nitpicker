import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { WorkspaceMember } from '../project-types.mts';
import { undeclaredHint, writeUndeclaredProjects } from './messages.mts';

const scratch = mkdtempSync(path.join(tmpdir(), 'nitpicker-messages-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function entries(count: number): WorkspaceMember[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `svc/p${String(index + 1)}`,
    origin: index % 2 === 0 ? 'Gradle build' : 'Python project',
  }));
}

describe('undeclaredHint', () => {
  it('is empty when there are no undeclared projects', () => {
    expect(undeclaredHint([])).toEqual([]);
  });

  it('describes one to three projects inline without a list file note', () => {
    expect(undeclaredHint([{ path: 'android', origin: 'Gradle build' }])).toEqual([
      'android (Gradle build) looks like a project of its own, and this run does not gate it ' +
        'with its own preset. To gate it in one run, list it in "projects" of ' +
        'nitpicker.config.json, for example "projects": [".", "android"].',
    ]);
    expect(
      undeclaredHint(entries(3), ['.'], { listFile: 'reports/undeclared-projects.txt' }),
    ).toEqual([
      'svc/p1 (Gradle build), svc/p2 (Python project), svc/p3 (Gradle build) look like projects ' +
        'of their own, and this run does not gate them with their own preset. To gate each in ' +
        'one run, list them in "projects" of nitpicker.config.json, for example ' +
        '"projects": [".", "svc/p1", "svc/p2", "svc/p3"].',
    ]);
  });

  it('shortens four or more projects to the total count, first three paths, and optional list file', () => {
    const many = entries(12);

    expect(
      undeclaredHint(many, ['.'], { listFile: 'reports/quality/diff/undeclared-projects.txt' }),
    ).toEqual([
      '12 folders look like projects of their own: svc/p1 (Gradle build), ' +
        'svc/p2 (Python project), svc/p3 (Gradle build), and 9 more. This run does not gate ' +
        'them with their own preset. To gate each in one run, list them in "projects" of ' +
        'nitpicker.config.json, for example "projects": [".", "svc/p1", "svc/p2", "svc/p3", ...]. ' +
        'Full list: reports/quality/diff/undeclared-projects.txt.',
    ]);
    expect(undeclaredHint(many, ['web', 'api'])).toEqual([
      '12 folders look like projects of their own: svc/p1 (Gradle build), ' +
        'svc/p2 (Python project), svc/p3 (Gradle build), and 9 more. This run does not gate ' +
        'them with their own preset. To gate each in one run, list them in "projects" of ' +
        'nitpicker.config.json, for example "projects": ["web", "api", "svc/p1", "svc/p2", "svc/p3", ...].',
    ]);
  });

  it('keeps the projects example short even when current has many projects', () => {
    const [notice] = undeclaredHint(entries(5), ['a', 'b', 'c', 'd', 'e']);

    expect(notice).toContain('"projects": ["a", "b", "c", ..., "svc/p1", "svc/p2", "svc/p3", ...]');
  });
});

describe('writeUndeclaredProjects', () => {
  it('writes all entries one per line when more than three are found and removes stale files later', () => {
    const repoRoot = mkdtempSync(path.join(scratch, 'repo-'));
    const outputRoot = path.join(repoRoot, 'reports', 'quality', 'diff');
    const file = path.join(outputRoot, 'undeclared-projects.txt');

    expect(writeUndeclaredProjects(outputRoot, entries(3), repoRoot)).toBeUndefined();
    expect(existsSync(file)).toBe(false);

    expect(writeUndeclaredProjects(outputRoot, entries(5), repoRoot)).toBe(
      'reports/quality/diff/undeclared-projects.txt',
    );
    expect(readFileSync(file, 'utf8')).toBe(
      [
        'svc/p1 (Gradle build)',
        'svc/p2 (Python project)',
        'svc/p3 (Gradle build)',
        'svc/p4 (Python project)',
        'svc/p5 (Gradle build)',
        '',
      ].join('\n'),
    );

    expect(writeUndeclaredProjects(outputRoot, entries(2), repoRoot)).toBeUndefined();
    expect(existsSync(file)).toBe(false);
  });

  it('returns the full file path when outputRoot is outside baseRoot or baseRoot is omitted', () => {
    const repoRoot = mkdtempSync(path.join(scratch, 'repo-'));
    const outputRoot = mkdtempSync(path.join(scratch, 'external-'));
    const expected = path.join(outputRoot, 'undeclared-projects.txt');

    expect(writeUndeclaredProjects(outputRoot, entries(4))).toBe(expected);
    expect(writeUndeclaredProjects(outputRoot, entries(4), repoRoot)).toBe(expected);
  });
});
