import { describe, expect, it } from 'vitest';
import { policyChangeFields } from '../describe-policy-changes.mjs';
import { createPolicyScope } from '../policy-scope.mjs';

const CONFIG = 'nitpicker.config.json';

function policy(config, folders) {
  return { ...config, duplicates: { skippedFolders: folders } };
}

function changes(base, head, { files, baseFiles = files, moves, content = 'code' }) {
  return policyChangeFields(
    base,
    head,
    createPolicyScope({
      files,
      baseFiles,
      baseRoots: {},
      headRoots: {},
      headConfig: head,
      moves,
      blobOf: (file) => (file === CONFIG ? JSON.stringify(head) : content),
    }),
  );
}

describe.each([
  ['typescript', 'src/legacy/a.ts', ['dist', 'build', 'generated', 'target']],
  ['javascript', 'src/legacy/a.js', ['dist', 'build', 'generated', 'target']],
  ['java', 'src/legacy/A.java', ['build', 'generated', 'target', 'out']],
  ['kotlin', 'src/legacy/a.kt', ['build', 'generated', 'target', 'out']],
  ['python', 'src/legacy/a.py', ['build', 'dist', 'tests', 'test', 'migrations']],
])('duplicate folder policy for %s', (preset, file, defaults) => {
  const base = { preset };

  it('requires acceptance when a newly skipped folder hides existing code', () => {
    const head = policy(base, [...defaults, 'legacy']);
    const result = changes(base, head, { files: [file] });

    expect(result.policyLoosenings).toEqual(['duplicates.skippedFolders added: **/legacy/**']);
    expect(result.policyDigest).toBeDefined();
    expect(changes(base, head, { files: [file], content: 'changed code' }).policyDigest).not.toBe(
      result.policyDigest,
    );
  });

  it('requires acceptance for newly added code hidden by the new folder', () => {
    const result = changes(base, policy(base, [...defaults, 'legacy']), {
      files: [file],
      baseFiles: [],
    });

    expect(result.policyLoosenings).toEqual([
      `duplicates.skippedFolders hide code this change adds or moves where the base config checked it: ${file}`,
    ]);
  });

  it('allows widening the scan and continuing an established skip', () => {
    expect(changes(base, policy(base, []), { files: [file] }).policyLoosenings).toEqual([]);
    const established = policy(base, ['legacy']);
    expect(changes(established, established, { files: [file] }).policyChanges).toEqual([]);
  });

  it('allows new code in folders that the preset already skipped by default', () => {
    const fileInDefault = `${defaults[0]}/${file.split('/').at(-1)}`;

    expect(changes(base, base, { files: [fileInDefault], baseFiles: [] }).policyLoosenings).toEqual(
      [],
    );
  });

  it('requires acceptance when removing an empty override restores a default skip', () => {
    const underDefault = file.replace('/legacy/', `/${defaults[0]}/`);
    const rootDefault = `${defaults[0]}/${file.split('/').at(-1)}`;
    const hidden = ['typescript', 'javascript'].includes(preset) ? rootDefault : underDefault;

    expect(changes(policy(base, []), base, { files: [hidden] }).policyLoosenings).toHaveLength(1);
  });
});

describe('duplicate folder scope and movement', () => {
  it('recognizes that explicit script folder lists also exclude nested folders', () => {
    const file = 'src/build/a.ts';
    expect(
      changes({}, policy({}, ['dist', 'build', 'generated', 'target']), { files: [file] })
        .policyLoosenings,
    ).toEqual(['duplicates.skippedFolders added: **/build/**']);
  });

  it('does not treat equivalent recursive JVM defaults as a loosening', () => {
    const base = { preset: 'java' };
    expect(
      changes(base, policy(base, ['build', 'generated', 'target', 'out']), {
        files: ['src/build/A.java'],
      }).policyChanges,
    ).toEqual([]);
  });

  it('detects new code under a previously dormant skip', () => {
    const config = policy({ preset: 'java' }, ['later']);
    expect(
      changes(config, config, { files: ['src/later/A.java'], baseFiles: [] }).policyLoosenings,
    ).toEqual([
      'duplicates.skippedFolders hide code this change adds or moves where the base hid no code: src/later/A.java',
    ]);
  });

  it('detects code moved from a scanned folder into an established skipped folder', () => {
    const config = policy({ preset: 'java' }, ['legacy']);
    expect(
      changes(config, config, {
        files: ['src/legacy/A.java'],
        baseFiles: ['src/main/A.java', 'src/legacy/Old.java'],
        moves: { files: new Map([['src/main/A.java', 'src/legacy/A.java']]) },
      }).policyLoosenings,
    ).toEqual([
      'duplicates.skippedFolders hide code this change adds or moves where the base config checked it: src/legacy/A.java',
    ]);
  });
});

describe.each([
  ['typescript', 'coverage', 'coverage/a.ts'],
  ['javascript', 'reports/quality', 'reports/quality/a.js'],
  ['typescript', 'node_modules', 'src/node_modules/a.ts'],
  ['typescript', 'legacy', 'src/legacy/a.d.ts'],
  ['typescript', '.stryker-tmp', 'src/.stryker-tmp/a.ts'],
  ['python', 'venv', 'src/venv/a.py'],
  ['python', 'legacy', 'src/legacy/test_a.py'],
  ['python', 'legacy', 'src/legacy/a_test.py'],
  ['python', 'legacy', 'src/legacy/conftest.py'],
])('permanent duplicate exclusions for %s', (preset, folder, file) => {
  const base = policy({ preset }, []);
  const head = policy(base, [folder]);

  it('does not count files already hidden by a permanent ignore as newly hidden', () => {
    expect(changes(base, head, { files: [file] }).policyLoosenings).toEqual([]);
    expect(changes(base, head, { files: [file], baseFiles: [] }).policyLoosenings).toEqual([]);
  });

  it('keeps permanent ignores established even when their folder override is removed', () => {
    expect(changes(head, base, { files: [file], baseFiles: [] }).policyLoosenings).toEqual([]);
  });
});

describe('root-only permanent script exclusions', () => {
  it('still requires acceptance for a newly hidden nested coverage folder', () => {
    expect(
      changes({}, policy({}, ['coverage']), { files: ['src/coverage/a.ts'] }).policyLoosenings,
    ).toEqual(['duplicates.skippedFolders added: **/coverage/**']);
  });
});
