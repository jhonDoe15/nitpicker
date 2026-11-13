import { mkdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../git/test-support/fixture-files.mjs';
import { commit, useGitFixtures } from '../../git/test-support/git-repository.mjs';
import { runStamp, workingTreeDigest as digestResult } from './run-stamp.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();
const OUTPUT = 'reports/quality/diff';

function workingTreeDigest(root, output) {
  const result = digestResult(root, output);
  return result.kind === 'digest' ? result.value : undefined;
}

function repository() {
  return createGitRepository({
    'src/a.ts': 'export const a = 1;\n',
    '.gitignore': 'node_modules/\n',
  }).root;
}

describe('workingTreeDigest', () => {
  it('stays the same while nothing changes, whatever the run wrote to the output folder', () => {
    const root = repository();
    const before = workingTreeDigest(root, OUTPUT);

    writeFiles(root, { [`${OUTPUT}/summary.json`]: '{}\n' });

    expect(before).toMatch(/^[0-9a-f]{64}$/u);
    expect(workingTreeDigest(root, OUTPUT)).toBe(before);
    expect(workingTreeDigest(root, path.join(root, OUTPUT))).toBe(before);
  });

  it.each([
    ['an edited tracked file', { 'src/a.ts': 'export const a = 2;\n' }],
    ['a new untracked file', { 'src/b.ts': 'export const b = 1;\n' }],
  ])('changes with %s', (_name, files) => {
    const root = repository();
    const before = workingTreeDigest(root, OUTPUT);

    writeFiles(root, files);

    expect(workingTreeDigest(root, OUTPUT)).not.toBe(before);
  });

  it('changes when an untracked file is edited and when a commit moves HEAD', () => {
    const root = repository();
    writeFiles(root, { 'src/b.ts': 'export const b = 1;\n' });
    const untracked = workingTreeDigest(root, OUTPUT);
    writeFiles(root, { 'src/b.ts': 'export const b = 2;\n' });
    const edited = workingTreeDigest(root, OUTPUT);
    commit(root, 'add b');

    expect(edited).not.toBe(untracked);
    expect(workingTreeDigest(root, OUTPUT)).not.toBe(edited);
  });

  it('ignores the output folders of both kinds of run, and a custom output folder', () => {
    const root = repository();
    const before = workingTreeDigest(root, OUTPUT);
    const custom = workingTreeDigest(root, 'custom-output');

    writeFiles(root, { 'reports/quality/snapshot/summary.json': '{}\n' });
    expect(workingTreeDigest(root, OUTPUT)).toBe(before);

    writeFiles(root, { 'custom-output/report.txt': 'x\n' });
    expect(workingTreeDigest(root, 'custom-output')).toBe(custom);
  });

  it('still gives a digest with a nested repository, a directory symlink and a vanished file', () => {
    const root = repository();
    const before = workingTreeDigest(root, OUTPUT);
    mkdirSync(path.join(root, 'nested/.git'), { recursive: true });
    writeFileSync(path.join(root, 'nested/.git/HEAD'), 'ref: refs/heads/main\n');
    symlinkSync(path.join(root, 'src'), path.join(root, 'link-to-src'));
    symlinkSync(path.join(root, 'missing'), path.join(root, 'dangling'));

    expect(workingTreeDigest(root, OUTPUT)).toMatch(/^[0-9a-f]{64}$/u);
    expect(workingTreeDigest(root, OUTPUT)).not.toBe(before);
  });

  it('follows the size and time of a large untracked file instead of reading it', () => {
    const root = repository();
    writeFileSync(path.join(root, 'big.bin'), Buffer.alloc(2 * 1024 * 1024));
    const before = workingTreeDigest(root, OUTPUT);

    utimesSync(path.join(root, 'big.bin'), new Date(0), new Date(1000));

    expect(workingTreeDigest(root, OUTPUT)).not.toBe(before);
  });

  it('is unavailable outside a git repository', () => {
    expect(digestResult(temporaryRoot('nitpicker-no-git-'), OUTPUT).kind).toBe('unavailable');
  });
});

describe('runStamp', () => {
  it('gives the time of the run and the digest of the working tree', () => {
    const root = repository();

    expect(runStamp({ projectRoot: root, outputRoot: OUTPUT, now: new Date(0) })).toEqual({
      generatedAt: '1970-01-01T00:00:00.000Z',
      workingTree: workingTreeDigest(root, OUTPUT),
    });
  });

  it('leaves the digest out when there is no repository', () => {
    const stamp = runStamp({ projectRoot: temporaryRoot('nitpicker-no-git-'), outputRoot: OUTPUT });

    expect(Object.keys(stamp)).toEqual(['generatedAt']);
  });
});
