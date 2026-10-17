import { describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { resolveComparison } from '../diff/git/repository/git.mjs';
import { branchOff } from '../diff/git/test-support/branch-off.mjs';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { comparedConventions } from './test-support/compare-policy.mjs';

const { createGitRepository } = useGitFixtures();
const HEADER = "Following this project's conventions:\n";
const LISTED = ['project', 'nitpicker'];
const KOTLIN = 'package a\n\nclass A {\n  fun f() {\n    run()\n  }\n}\n';
const PYTHON = 'a = "a"\nb = "b"\nc = "c"\n';

function compared({ base, branch, config, directory }) {
  const { root } = createGitRepository(base);
  branchOff(root, branch);
  return comparedConventions({
    root,
    config,
    directory,
    resolvers: { resolveComparison, resolveHeadPolicy },
  });
}

describe('the detekt, ktlint and ktfmt configs of a kotlin project', () => {
  const detekt = (width) => `style:\n  MaxLineLength:\n    maxLineLength: ${String(width)}\n`;
  const config = {
    preset: 'kotlin',
    tools: { detekt: { precedence: LISTED }, ktlint: { precedence: LISTED } },
  };

  it('reads the detekt line length from the merge base, so a branch cannot raise its own limit', () => {
    const base = {
      'build.gradle.kts': 'ktlint',
      'detekt.yml': detekt(100),
      'src/A.kt': KOTLIN,
    };

    expect(compared({ base, branch: { 'detekt.yml': detekt(160) }, config }).conventions).toEqual({
      'kotlin.indentation': '2',
      'kotlin.lineLength': '100',
    });
  });

  it('reads the .editorconfig of ktlint from the merge base', () => {
    const editorconfig = (width) => `[*.{kt,kts}]\nmax_line_length = ${String(width)}\n`;
    const base = {
      'build.gradle.kts': 'ktlint',
      '.editorconfig': editorconfig(100),
      'src/A.kt': KOTLIN,
    };

    expect(
      compared({ base, branch: { '.editorconfig': editorconfig(160) }, config }).conventions,
    ).toEqual({ 'kotlin.indentation': '2', 'kotlin.lineLength': '100' });
  });

  it('does not let a branch opt in a formatter that the base did not have', () => {
    const base = { 'build.gradle.kts': 'plugins {}', 'src/A.kt': KOTLIN };
    const branch = {
      'build.gradle.kts': 'ktlint',
      '.editorconfig': '[*.kt]\nmax_line_length = 160\n',
    };

    expect(compared({ base, branch, config }).conventions).toBeUndefined();
  });

  it('reads the branch when the base has no Kotlin sources yet', () => {
    const branch = {
      'build.gradle.kts': 'ktlint',
      'detekt.yml': detekt(110),
      'src/A.kt': KOTLIN,
    };

    expect(compared({ base: { 'README.md': 'x' }, branch, config }).conventions).toEqual({
      'kotlin.indentation': '2',
      'kotlin.lineLength': '110',
    });
  });

  it('prints the line length it read from the base', () => {
    const base = {
      'build.gradle.kts': 'ktlint',
      'detekt.yml': detekt(100),
      'src/A.kt': KOTLIN,
    };
    const detektOnly = { preset: 'kotlin', tools: { detekt: { precedence: LISTED } } };
    const { printed } = compared({ base, branch: { 'README.md': 'x' }, config: detektOnly });

    expect(printed).toBe(
      HEADER +
        '  Kotlin indentation: 2 spaces (used by 1 of 1 measured files)\n' +
        '  Kotlin line length: 100 columns (from your detekt config)\n' +
        'ktlint runs with indent_size = 2, max_line_length = 100\n',
    );
  });
});

describe('the ruff config of a python project', () => {
  const ruff = (width) => `line-length = ${String(width)}\n`;
  const config = { preset: 'python', tools: { ruff: { precedence: LISTED } } };
  const FORMAT =
    "Format with ruff: ruff format --config ruff.toml --target-version py38 --config 'format.quote-style = \"double\"' --config 'indent-width = 4' .\n";

  it('reads the ruff line length from the merge base, so a branch cannot raise its own limit', () => {
    const base = { 'ruff.toml': ruff(100), 'a.py': PYTHON };

    expect(compared({ base, branch: { 'ruff.toml': ruff(160) }, config })).toEqual({
      conventions: { 'python.lineLength': '100' },
      printed: HEADER + '  Python line length: 100 columns (from your ruff config)\n' + FORMAT,
    });
  });

  it('reads the config of a parent folder from the merge base for a project in a subfolder', () => {
    const base = { 'ruff.toml': ruff(100), 'app/a.py': PYTHON };

    expect(
      compared({ base, branch: { 'ruff.toml': ruff(160) }, config, directory: 'app' }).conventions,
    ).toEqual({ 'python.lineLength': '100' });
  });

  it('follows the extended config of the base', () => {
    const base = {
      'ruff.toml': 'extend = "shared/base.toml"\n',
      'shared/base.toml': ruff(100),
      'a.py': PYTHON,
    };

    expect(
      compared({ base, branch: { 'shared/base.toml': ruff(160) }, config }).conventions,
    ).toEqual({ 'python.lineLength': '100' });
  });

  it('reads the branch when the base has no Python sources yet', () => {
    const branch = { 'ruff.toml': ruff(110), 'a.py': PYTHON };

    expect(compared({ base: { 'README.md': 'x' }, branch, config }).conventions).toEqual({
      'python.lineLength': '110',
    });
  });
});
