import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { snapshotPolicy } from './resolve.mjs';

const { createGitRepository } = useGitFixtures();
const SINGLE_QUOTED = "a = 'a'\nb = 'b'\nc = 'c'\ndef f():\n  return 'd'\n";
const DOUBLE_QUOTED = 'a = "a"\nb = "b"\nc = "c"\ndef f():\n    return "d"\n';
const LISTED = ['project', 'nitpicker'];
const NO_COMMAS = 'fun f() {\n  g(\n    1,\n    2\n  )\n  g(\n    3,\n    4\n  )\n}\n';
const TWO_SPACES = 'package a\n\nclass A {\n  fun f() {\n    run()\n  }\n}\n';

function follow(config, files) {
  const { root } = createGitRepository(files);
  const chunks = [];
  const policy = snapshotPolicy({
    config,
    currentProjectRoot: root,
    headPolicy: resolveHeadPolicy(config, root),
    stdout: { write: (chunk) => chunks.push(chunk) },
  });
  return { conventions: policy.conventions, printed: chunks.join('') };
}

const HEADER = "Following this project's conventions:\n";

describe('Python conventions with the ruff config of the project', () => {
  const ruffToml = 'line-length = 120\n[format]\nquote-style = "single"\n';

  it('takes the keys the config sets, names it as the source, and measures the rest', () => {
    const config = { preset: 'python', tools: { ruff: { precedence: LISTED } } };

    expect(follow(config, { 'ruff.toml': ruffToml, 'a.py': DOUBLE_QUOTED })).toEqual({
      conventions: { 'python.quotes': 'single', 'python.lineLength': '120' },
      printed:
        HEADER +
        '  Python quotes: single quotes (from your ruff config)\n' +
        '  Python line length: 120 columns (from your ruff config)\n',
    });
  });

  it('lets the config win over a pin and a pin win over the files', () => {
    const config = {
      preset: 'python',
      tools: { ruff: { precedence: LISTED } },
      conventions: { 'python.lineLength': '79', 'python.quotes': 'single' },
    };

    expect(follow(config, { 'ruff.toml': 'line-length = 100\n', 'a.py': DOUBLE_QUOTED })).toEqual({
      conventions: { 'python.quotes': 'single', 'python.lineLength': '100' },
      printed:
        HEADER +
        '  Python quotes: single quotes (set in nitpicker.config.json)\n' +
        '  Python line length: 100 columns (from your ruff config)\n',
    });
  });

  it('ignores the config unless the project is listed or when nitpicker is listed first', () => {
    const files = { 'ruff.toml': ruffToml, 'a.py': DOUBLE_QUOTED };

    expect(follow({ preset: 'python' }, files)).toEqual({ conventions: undefined, printed: '' });
    expect(
      follow(
        { preset: 'python', tools: { ruff: { precedence: ['nitpicker', 'project'] } } },
        files,
      ),
    ).toEqual({ conventions: undefined, printed: '' });
  });
});

describe('Python conventions that black can apply', () => {
  const black = { preset: 'python', python: { formatter: 'black' } };

  it('skips the indentation and says black accepts both quote styles', () => {
    expect(follow(black, { 'a.py': SINGLE_QUOTED })).toEqual({
      conventions: { 'python.quotes': 'single' },
      printed:
        HEADER +
        '  Python quotes: single quotes, black accepts both quote styles (used by 1 of 1 measured files)\n',
    });
  });

  it('refuses a pin black cannot apply', () => {
    expect(() =>
      follow({ ...black, conventions: { 'python.indentation': '2' } }, { 'a.py': SINGLE_QUOTED }),
    ).toThrow('"conventions.python.indentation" has no effect: black has no indentation setting');
  });

  it('names the black config when the project is listed', () => {
    const config = { ...black, tools: { black: { precedence: LISTED } } };
    const files = {
      'pyproject.toml': '[tool.black]\nline-length = 100\nskip-string-normalization = true\n',
    };

    expect(follow(config, files)).toEqual({
      conventions: { 'python.quotes': 'single', 'python.lineLength': '100' },
      printed:
        HEADER +
        '  Python quotes: single quotes, black accepts both quote styles (from your black config)\n' +
        '  Python line length: 100 columns (from your black config)\n',
    });
  });
});

describe('Kotlin conventions that the formatter can apply', () => {
  it('leaves out the trailing commas when ktfmt runs, and refuses a pin for them', () => {
    const files = { 'build.gradle.kts': 'ktfmt()', 'src/A.kt': NO_COMMAS, 'src/B.kt': NO_COMMAS };

    expect(follow({ preset: 'kotlin' }, files)).toEqual({
      conventions: { 'kotlin.indentation': '2' },
      printed: HEADER + '  Kotlin indentation: 2 spaces (used by 2 of 2 measured files)\n',
    });
    expect(() =>
      follow({ preset: 'kotlin', conventions: { 'kotlin.trailingCommas': 'never' } }, files),
    ).toThrow(
      '"conventions.kotlin.trailingCommas" has no effect: ktfmt always adds trailing commas',
    );
  });

  it('applies the indentation and the commas to ktlint and neither without a formatter', () => {
    const files = { 'build.gradle.kts': 'ktlint', 'src/A.kt': NO_COMMAS, 'src/B.kt': NO_COMMAS };

    expect(follow({ preset: 'kotlin' }, files).conventions).toEqual({
      'kotlin.indentation': '2',
      'kotlin.trailingCommas': 'never',
    });
    expect(follow({ preset: 'kotlin' }, { 'src/A.kt': NO_COMMAS, 'src/B.kt': NO_COMMAS })).toEqual({
      conventions: undefined,
      printed: '',
    });
    expect(() =>
      follow(
        { preset: 'kotlin', conventions: { 'kotlin.indentation': '4' } },
        { 'src/A.kt': TWO_SPACES },
      ),
    ).toThrow('"conventions.kotlin.indentation" has no effect: no Kotlin formatter runs');
  });

  it('names the .editorconfig and the detekt config as the source when they are listed', () => {
    const config = {
      preset: 'kotlin',
      tools: { ktlint: { precedence: LISTED }, detekt: { precedence: LISTED } },
    };
    const files = {
      'build.gradle.kts': 'ktlint',
      '.editorconfig': '[*.{kt,kts}]\nindent_size = 4\nij_kotlin_allow_trailing_comma = true\n',
      'config/detekt/detekt.yml': 'style:\n  WildcardImport:\n    active: false\n',
      'src/A.kt': TWO_SPACES,
    };

    expect(follow(config, files)).toEqual({
      conventions: { 'kotlin.indentation': '4', 'kotlin.wildcardImports': 'wildcard' },
      printed:
        HEADER +
        '  Kotlin indentation: 4 spaces (from your .editorconfig)\n' +
        '  Kotlin trailing commas: required in wrapped lists (from your .editorconfig)\n' +
        '  Kotlin imports: wildcards allowed (from your detekt config)\n',
    });
  });
});
