import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const listings = vi.hoisted(() => []);

vi.mock('node:child_process', () => ({
  execFile: (command, args, options, callback) => {
    listings.push({ command, args, options });
    callback(null, { stdout: '[]' });
  },
}));

describe('oxlint rule listing', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
    listings.length = 0;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('runs outside the package folder so that a gitignore above an installed copy cannot hide it', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-plan-'));
    roots.push(root);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'oxlint-plan.mjs', root]);

    await import('../oxlint-plan.mjs');

    expect(listings).toHaveLength(1);
    expect(listings[0].args.slice(1)).toEqual(['--rules', '--format', 'json']);
    expect(listings[0].options.cwd).toBe(tmpdir());
    expect(write).toHaveBeenCalledOnce();
  });
});
