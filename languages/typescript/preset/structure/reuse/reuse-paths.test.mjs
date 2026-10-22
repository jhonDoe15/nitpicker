import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isReuseProductionPath, projectPathOf } from './reuse-paths.mjs';

describe('reuse production paths', () => {
  it.each(['src/a.ts', 'src/history.ts', 'src/storybook.ts'])('keeps %s', (file) => {
    expect(isReuseProductionPath(file)).toBe(true);
  });

  it.each([
    'src/card.stories.tsx',
    'src/card.story.ts',
    'src/__mocks__/api.ts',
    'src/__fixtures__/user.ts',
    'src/fixtures/user.ts',
    'src/stories/button.tsx',
  ])('leaves out %s', (file) => {
    expect(isReuseProductionPath(file)).toBe(false);
  });
});

describe('project paths', () => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'reuse-paths-')));
  const live = path.join(base, 'live');
  const snapshot = path.join(base, 'snapshot');
  mkdirSync(path.join(live, 'node_modules'), { recursive: true });
  mkdirSync(snapshot);
  symlinkSync(path.join(live, 'node_modules'), path.join(snapshot, 'node_modules'));
  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('maps a file of the project, and one of the checkout its node_modules links to', () => {
    const projectPath = projectPathOf(snapshot);

    expect(projectPath(path.join(snapshot, 'src/a.ts'))).toBe('src/a.ts');
    expect(projectPath(path.join(live, 'packages/ui/src/index.ts'))).toBe(
      'packages/ui/src/index.ts',
    );
    expect(projectPath(path.join(base, 'elsewhere/b.ts'))).toBeUndefined();
  });
});
