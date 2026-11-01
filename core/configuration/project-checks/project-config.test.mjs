import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nestedCheckout, useGitCheckouts } from '../../diff/git/test-support/git-checkout.mjs';
import { loadConfig } from '../config.mjs';
import { validateConfig } from '../validate.mjs';

const { gitCheckout } = useGitCheckouts();

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(config, files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-config-'));
  roots.push(root);
  writeFileSync(path.join(root, 'nitpicker.config.json'), JSON.stringify(config));
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), 'export {};\n');
  }
  return root;
}

function unanalyzed(file) {
  return new Error(
    `nitpicker.config.json: "preset": "javascript" does not analyze .jsx and .tsx files, and ${file} is one. ` +
      'Use "preset": "typescript", which reads them, or list the path in "exclude".',
  );
}

describe('config checks that need the project', () => {
  it.each(['HEAD', '@'])('rejects "base": "%s" as a comparison with itself', (base) => {
    expect(() => validateConfig({ base })).toThrow(
      new Error(
        `nitpicker.config.json: "base" cannot be "${base}": the change would be compared with itself. ` +
          'Name a branch such as "origin/main", or pass --base <ref>.',
      ),
    );
    expect(validateConfig({ base: 'origin/main' })).toEqual({ base: 'origin/main' });
  });

  it.each(['src/App.tsx', 'test/ui/View.jsx'])(
    'rejects the javascript preset when %s would go unanalyzed',
    (file) => {
      const root = project({ preset: 'javascript' }, [file, 'src/a.js']);
      expect(() => loadConfig(root)).toThrow(unanalyzed(file));
    },
  );

  it('accepts the javascript preset for .ts files, an excluded .tsx file and other presets', () => {
    const javascript = { preset: 'javascript' };
    expect(loadConfig(project(javascript, ['src/a.js', 'src/b.ts']))).toEqual(javascript);
    const excluded = { preset: 'javascript', exclude: ['src/legacy/**'] };
    expect(loadConfig(project(excluded, ['src/legacy/Old.tsx']))).toEqual(excluded);
    const typescript = { preset: 'typescript' };
    expect(loadConfig(project(typescript, ['src/App.tsx']))).toEqual(typescript);
  });

  it('looks in the configured roots, not only in src', () => {
    const config = { preset: 'javascript', layout: { sourceRoots: ['lib'] } };
    expect(() => loadConfig(project(config, ['lib/deep/View.tsx']))).toThrow(
      unanalyzed('lib/deep/View.tsx'),
    );
    expect(loadConfig(project(config, ['src/View.tsx']))).toEqual(config);
  });

  it('does not read .tsx files in git-ignored folders or nested checkouts', () => {
    const view = { 'src/View.tsx': 'export {};\n' };
    const files = {
      'nitpicker.config.json': '{"preset":"javascript"}',
      'src/a.js': 'export {};\n',
      ...nestedCheckout('src/agent', view),
      'src/generated/View.tsx': 'export {};\n',
    };

    expect(loadConfig(gitCheckout(files, ['src/generated/']))).toEqual({ preset: 'javascript' });
    expect(() => loadConfig(gitCheckout({ ...files, ...view }, ['src/generated/']))).toThrow(
      unanalyzed('src/View.tsx'),
    );
  });
});
