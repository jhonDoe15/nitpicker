import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readConfigObject } from './config-module.mjs';
import { readStrykerProjectConfig, strykerProjectFile } from './stryker-project-config.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-config-module-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe('loading a project config module', () => {
  it('ignores what the config prints while it loads', () => {
    const root = projectWith({
      'stryker.config.mjs': [
        'console.log(\'NITPICKER_PROJECT_CONFIG_RESULT {"value":{"concurrency":99}}\');',
        "console.log('noise');",
        'export default { concurrency: 2 };',
      ].join('\n'),
    });

    expect(readConfigObject(root, 'stryker.config.mjs')).toEqual({ concurrency: 2 });
  });

  it('explains a config that ends the process', () => {
    const root = projectWith({ 'stryker.config.mjs': 'process.exit(0);' });

    expect(() => readConfigObject(root, 'stryker.config.mjs')).toThrow(
      'stryker.config.mjs could not be loaded: it ended the process with exit code 0',
    );
  });

  it('stops a config that does not finish loading', () => {
    const root = projectWith({ 'stryker.config.mjs': 'while (true) {}' });

    expect(() => readConfigObject(root, 'stryker.config.mjs', 500)).toThrow(
      'stryker.config.mjs did not finish loading within 0.5 s',
    );
  });

  it('stops a config that prints too much', () => {
    const root = projectWith({
      'stryker.config.mjs':
        "for (let line = 0; line < 400; line += 1) console.log('x'.repeat(100_000));",
    });

    expect(() => readConfigObject(root, 'stryker.config.mjs')).toThrow(
      'stryker.config.mjs printed more than 10 MB while loading',
    );
  });

  it('does not hand the host CI output file to the config', () => {
    const root = projectWith({
      'stryker.config.mjs':
        'export default { concurrency: process.env.GITHUB_STEP_SUMMARY ? 2 : 1 };',
    });
    const previous = process.env.GITHUB_STEP_SUMMARY;
    process.env.GITHUB_STEP_SUMMARY = '/tmp/summary.md';
    try {
      expect(readConfigObject(root, 'stryker.config.mjs')).toEqual({ concurrency: 1 });
    } finally {
      if (previous === undefined) {
        delete process.env.GITHUB_STEP_SUMMARY;
      } else {
        process.env.GITHUB_STEP_SUMMARY = previous;
      }
    }
  });

  it('skips a directory named like a Stryker config', () => {
    const root = projectWith({
      'stryker.config.mjs/notes.txt': 'x',
      '.stryker.conf.json': '{"concurrency": 4}',
    });

    expect(strykerProjectFile(root)).toBe('.stryker.conf.json');
    expect(readStrykerProjectConfig(root)).toEqual({ concurrency: 4 });
    expect(strykerProjectFile(projectWith({ 'stryker.conf.json/a': 'x' }))).toBeUndefined();
  });
});
