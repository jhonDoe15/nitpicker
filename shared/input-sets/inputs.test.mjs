import { describe, expect, it } from 'vitest';
import {
  EVERYTHING_INPUTS,
  EXECUTION_INPUTS,
  REPOSITORY_INPUTS,
  sourceInputs,
  touchesInputs,
} from './inputs.mjs';

const modified = (path) => ({ path, kind: 'modified' });
const typescript = sourceInputs(['ts', 'tsx']);

describe('touchesInputs', () => {
  it.each(['README.md', 'docs/usage.md', 'CHANGELOG.md', 'LICENSE'])(
    'treats an edit to %s as read by no analyzer except the repository checks',
    (file) => {
      expect(touchesInputs(EXECUTION_INPUTS, modified(file))).toBe(false);
      expect(touchesInputs(typescript, modified(file))).toBe(false);
      expect(touchesInputs(EVERYTHING_INPUTS, modified(file))).toBe(true);
      expect(touchesInputs(REPOSITORY_INPUTS, modified(file), { readsContent: () => false })).toBe(
        false,
      );
      expect(touchesInputs(REPOSITORY_INPUTS, modified(file), { readsContent: () => true })).toBe(
        true,
      );
    },
  );

  it.each(['src/main/notes.md', 'test/fixtures/sample.md', 'src/assets/logo.png'])(
    'treats %s as an input because it sits beside code or tests',
    (file) => {
      expect(touchesInputs(EXECUTION_INPUTS, modified(file))).toBe(true);
    },
  );

  it('treats an image as an input of analyzers that run tests but not of the others', () => {
    expect(touchesInputs(EXECUTION_INPUTS, modified('docs/diagram.png'))).toBe(true);
    expect(touchesInputs(typescript, modified('docs/diagram.png'))).toBe(false);
  });

  it.each(['e2e/notes.md', 'examples/readme.md', 'data/table.md', 'public/logo.png'])(
    'treats %s as an input because of its folder',
    (file) => {
      expect(touchesInputs(EXECUTION_INPUTS, modified(file))).toBe(true);
    },
  );

  it('treats documentation under a configured root as an input', () => {
    const roots = ['packages/core'];

    expect(touchesInputs(EXECUTION_INPUTS, modified('packages/core/NOTES.md'), { roots })).toBe(
      true,
    );
    expect(touchesInputs(EXECUTION_INPUTS, modified('apps/x/packages/core/a.md'), { roots })).toBe(
      true,
    );
    expect(touchesInputs(EXECUTION_INPUTS, modified('NOTES.md'), { roots })).toBe(false);
  });

  it('treats a removed or renamed documentation file like an added one', () => {
    const removed = { path: 'README.md', kind: 'removed' };

    expect(touchesInputs(EXECUTION_INPUTS, removed)).toBe(false);
    expect(touchesInputs(typescript, removed)).toBe(false);
    expect(touchesInputs(REPOSITORY_INPUTS, removed)).toBe(true);
    expect(touchesInputs(EXECUTION_INPUTS, { path: 'src/main.ts', kind: 'removed' })).toBe(true);
  });

  it.each([
    'nitpicker.config.json',
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'tsconfig.build.json',
    'eslint.config.mjs',
    '.prettierrc',
    'build.gradle',
    'build.gradle.kts',
    'settings.gradle.kts',
    'gradle/libs.versions.toml',
    'pom.xml',
    'pyproject.toml',
    'uv.lock',
    'requirements-dev.txt',
    'go.mod',
    'go.sum',
    'config/checkstyle/checkstyle.xml',
    'packages/app/package.json',
  ])('treats %s as an input of every analyzer', (file) => {
    const touched = [EXECUTION_INPUTS, typescript, REPOSITORY_INPUTS, EVERYTHING_INPUTS].map(
      (inputs) => touchesInputs(inputs, modified(file), { readsContent: () => false }),
    );

    expect(touched).toEqual([true, true, true, true]);
  });

  it('limits source analyzers to their extensions, configuration formats and dotfiles', () => {
    expect(touchesInputs(typescript, modified('src/main/app.ts'))).toBe(true);
    expect(touchesInputs(typescript, modified('src/main/data.json'))).toBe(true);
    expect(touchesInputs(typescript, modified('.custom-tool'))).toBe(true);
    expect(touchesInputs(typescript, modified('src/Main.java'))).toBe(false);
    expect(touchesInputs(typescript, modified('test/fixtures/rows.csv'))).toBe(false);
  });

  it('treats everything outside the documentation set as an input of execution analyzers', () => {
    expect(touchesInputs(EXECUTION_INPUTS, modified('test/fixtures/rows.csv'))).toBe(true);
    expect(touchesInputs(EXECUTION_INPUTS, modified('src/Main.java'))).toBe(true);
  });

  it('treats an analyzer without declared inputs as reading everything', () => {
    expect(touchesInputs(undefined, modified('README.md'))).toBe(true);
  });
});
