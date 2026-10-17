import { describe, expect, it, vi } from 'vitest';
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

function compared({ base, branch, config, directory, environment }) {
  const { root } = createGitRepository(base);
  branchOff(root, branch);
  environment?.();
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

  it('follows the measured style, not the .editorconfig of the branch, when the branch adds the formatter', () => {
    const base = { 'build.gradle.kts': 'plugins {}', 'src/A.kt': KOTLIN };
    const branch = {
      'build.gradle.kts': 'ktlint',
      '.editorconfig': '[*.kt]\nmax_line_length = 160\n',
    };

    expect(compared({ base, branch, config }).conventions).toEqual({ 'kotlin.indentation': '2' });
  });

  it('accepts a pin for a setting that only the formatter of the branch uses', () => {
    const base = { 'build.gradle.kts': 'plugins {}', 'src/A.kt': KOTLIN };
    const pinned = { ...config, conventions: { 'kotlin.lineLength': '120' } };

    expect(
      compared({ base, branch: { 'build.gradle.kts': 'ktlint' }, config: pinned }).conventions,
    ).toEqual({ 'kotlin.indentation': '2', 'kotlin.lineLength': '120' });
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

  it('prints the ktlint widths of the base and says that they win over the branch .editorconfig', () => {
    const editorconfig = (width) => `[*.{kt,kts}]\nmax_line_length = ${String(width)}\n`;
    const base = {
      'build.gradle.kts': 'ktlint',
      '.editorconfig': editorconfig(100),
      'src/A.kt': KOTLIN,
    };
    const ktlintOnly = { preset: 'kotlin', tools: { ktlint: { precedence: LISTED } } };

    expect(
      compared({ base, branch: { '.editorconfig': editorconfig(160) }, config: ktlintOnly })
        .printed,
    ).toBe(
      HEADER +
        '  Kotlin indentation: 2 spaces (used by 1 of 1 measured files)\n' +
        '  Kotlin line length: 100 columns (from your .editorconfig)\n' +
        'ktlint reads your .editorconfig files, and uses indent_size = 2, max_line_length = 100 where they set nothing; the followed limits (indent_size, max_line_length) win over them\n',
    );
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

describe('the Kotlin settings that cannot be followed', () => {
  const detekt = (body) => `style:\n  MaxLineLength:\n${body}`;
  const config = { preset: 'kotlin', tools: { detekt: { precedence: LISTED } } };
  const files = (yml) => ({ 'build.gradle.kts': 'ktlint', 'detekt.yml': yml, 'src/A.kt': KOTLIN });

  it('says why it ignored a detekt width outside 10 to 999, and measures instead', () => {
    const base = files(detekt('    maxLineLength: 1000\n'));

    expect(compared({ base, branch: { 'README.md': 'x' }, config })).toEqual({
      conventions: { 'kotlin.indentation': '2' },
      printed:
        HEADER +
        '  Kotlin indentation: 2 spaces (used by 1 of 1 measured files)\n' +
        'Ignoring the kotlin line length of 1000 columns from your detekt config: it must be a whole number from 10 to 999\n' +
        'ktlint runs with indent_size = 2\n',
    });
  });

  it('does not read a MaxLineLength rule that is switched off', () => {
    const base = files(detekt('    active: false\n    maxLineLength: 150\n'));

    expect(compared({ base, branch: { 'README.md': 'x' }, config }).conventions).toEqual({
      'kotlin.indentation': '2',
    });
  });

  it('takes the declared ktfmt style from the build file of the base without any opt-in', () => {
    const base = {
      'build.gradle.kts': 'ktfmt { kotlinLangStyle() }',
      'src/A.kt': KOTLIN,
    };
    const branch = { 'build.gradle.kts': 'ktfmt { metaStyle() }' };

    expect(compared({ base, branch, config: { preset: 'kotlin' } })).toEqual({
      conventions: { 'kotlin.indentation': '4' },
      printed:
        HEADER +
        '  Kotlin indentation: 4 spaces (from your build file)\n' +
        'Format with ktfmt: ktfmt --kotlinlang-style <Kotlin files>\n',
    });
  });

  it('builds no copy of the merge base when no tool lists the project config', () => {
    const base = files(detekt('    maxLineLength: 100\n'));
    const plain = { preset: 'kotlin' };
    const environment = () => vi.stubEnv('TMPDIR', '/nonexistent-directory-for-nitpicker-tests');

    try {
      expect(
        compared({ base, branch: { 'README.md': 'x' }, config: plain, environment }).conventions,
      ).toEqual({ 'kotlin.indentation': '2' });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('the ruff config of a python project', () => {
  const ruff = (width) => `line-length = ${String(width)}\n`;
  const config = { preset: 'python', tools: { ruff: { precedence: LISTED } } };
  const FORMAT =
    "Format with ruff: ruff format --config ruff.toml --target-version py38 --line-length 100 --config 'format.quote-style = \"double\"' --config 'indent-width = 4' .\n";

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

  it('keeps a base width that equals the default, so the branch cannot raise it', () => {
    const base = { 'ruff.toml': ruff(88), 'a.py': PYTHON };
    const { conventions, printed } = compared({
      base,
      branch: { 'ruff.toml': ruff(120) },
      config,
    });

    expect(conventions).toEqual({ 'python.lineLength': '88' });
    expect(printed).toBe(
      HEADER +
        '  Python line length: 88 columns (from your ruff config)\n' +
        "Format with ruff: ruff format --config ruff.toml --target-version py38 --line-length 88 --config 'format.quote-style = \"double\"' --config 'indent-width = 4' .\n",
    );
  });

  it('keeps a base indentation that equals the default, so the branch cannot change it', () => {
    const toml = (width) => `line-length = 100\nindent-width = ${String(width)}\n`;
    const base = { 'ruff.toml': toml(4), 'a.py': PYTHON };

    expect(compared({ base, branch: { 'ruff.toml': toml(2) }, config }).conventions).toEqual({
      'python.indentation': '4',
      'python.lineLength': '100',
    });
  });

  it('says why it ignored a width outside 10 to 999', () => {
    const base = { 'ruff.toml': ruff(1000), 'a.py': PYTHON };

    expect(compared({ base, branch: { 'README.md': 'x' }, config }).printed).toBe(
      'Ignoring the python line length of 1000 columns from your ruff config: it must be a whole number from 10 to 999\n' +
        "Format with ruff: ruff format --config ruff.toml --target-version py38 --config 'format.quote-style = \"double\"' --config 'indent-width = 4' .\n",
    );
  });

  it('accepts a pin that only the formatter of the branch uses', () => {
    const pinned = { preset: 'python', conventions: { 'python.indentation': '2' } };
    const base = { 'pyproject.toml': '[tool.black]\nline-length = 88\n', 'a.py': PYTHON };
    const branch = { 'pyproject.toml': '[tool.ruff]\nline-length = 88\n' };

    expect(compared({ base, branch, config: pinned }).conventions).toEqual({
      'python.indentation': '2',
    });
  });

  it('refuses a pin that neither the base nor the branch formatter uses', () => {
    const pinned = { preset: 'python', conventions: { 'python.indentation': '2' } };
    const base = { 'pyproject.toml': '[tool.black]\nline-length = 88\n', 'a.py': PYTHON };

    expect(() => compared({ base, branch: { 'README.md': 'x' }, config: pinned })).toThrow(
      'nitpicker.config.json: "conventions.python.indentation" has no effect: black has no indentation setting',
    );
  });
});
