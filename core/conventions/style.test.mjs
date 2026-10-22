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
        '  Python line length: 120 columns (from your ruff config)\n' +
        "Format with ruff: ruff format --config ruff.toml --target-version py38 --config 'indent-width = 4' .\n",
    });
  });

  it('follows a ruff line length that is none of 79, 88, 100 and 120', () => {
    const config = { preset: 'python', tools: { ruff: { precedence: LISTED } } };

    expect(follow(config, { 'ruff.toml': 'line-length = 110\n', 'a.py': DOUBLE_QUOTED })).toEqual({
      conventions: { 'python.lineLength': '110' },
      printed:
        HEADER +
        '  Python line length: 110 columns (from your ruff config)\n' +
        "Format with ruff: ruff format --config ruff.toml --target-version py38 --config 'format.quote-style = \"double\"' --config 'indent-width = 4' .\n",
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
        '  Python line length: 100 columns (from your ruff config, overriding the pin of 79 columns in nitpicker.config.json)\n' +
        `Format with ruff: ruff format --config ruff.toml --target-version py38 --config 'format.quote-style = "single"' --config 'indent-width = 4' .\n`,
    });
  });

  it('ignores the config unless the project is listed, and says so once', () => {
    const files = { 'ruff.toml': ruffToml, 'a.py': DOUBLE_QUOTED };

    expect(follow({ preset: 'python' }, files)).toEqual({
      conventions: undefined,
      printed:
        `Format with ruff: ruff format --isolated --target-version py38 --line-length 88 --config 'format.quote-style = "double"' --config 'indent-width = 4' .\n` +
        'Ignoring ruff.toml; opt in with "tools": { "ruff": { "precedence": ["project", "nitpicker"] } }\n',
    });
    expect(
      follow({ preset: 'python' }, { 'pyproject.toml': '[tool.ruff]\nline-length = 99\n' }).printed,
    ).toBe(
      `Format with ruff: ruff format --isolated --target-version py38 --line-length 88 --config 'format.quote-style = "double"' --config 'indent-width = 4' .\n` +
        'Ignoring [tool.ruff] in pyproject.toml; opt in with "tools": { "ruff": { "precedence": ["project", "nitpicker"] } }\n',
    );
    expect(follow({ preset: 'python' }, { 'a.py': DOUBLE_QUOTED }).printed).not.toContain(
      'Ignoring',
    );
  });

  it('measures the files and lets the conventions win when nitpicker is listed first', () => {
    const config = { preset: 'python', tools: { ruff: { precedence: ['nitpicker', 'project'] } } };

    expect(follow(config, { 'ruff.toml': ruffToml, 'a.py': SINGLE_QUOTED })).toEqual({
      conventions: { 'python.quotes': 'single', 'python.indentation': '2' },
      printed:
        HEADER +
        '  Python quotes: single quotes (used by 1 of 1 measured files)\n' +
        '  Python indentation: 2 spaces (used by 1 of 1 measured files)\n' +
        `Format with ruff: ruff format --config ruff.toml --target-version py38 --line-length 88 --config 'format.quote-style = "single"' --config 'indent-width = 2' .\n`,
    });
  });
});

describe('Python type checker configs of the project', () => {
  const fixed = `Format with ruff: ruff format --isolated --target-version py38 --line-length 88 --config 'format.quote-style = "double"' --config 'indent-width = 4' .\n`;
  const optIn = (tool) => `"tools": { "${tool}": { "precedence": ["project", "nitpicker"] } }`;

  it('says once that a pyright file is ignored, and stops after the opt-in', () => {
    const files = { 'pyrightconfig.json': '{ "reportAny": false }', 'a.py': DOUBLE_QUOTED };

    expect(follow({ preset: 'python' }, files).printed).toBe(
      `${fixed}Ignoring pyrightconfig.json except its environment keys; opt in with ${optIn('pyright')}\n`,
    );
    expect(
      follow({ preset: 'python', tools: { pyright: { precedence: LISTED } } }, files).printed,
    ).toBe(fixed);
  });

  it('names the pyproject table of basedpyright under the pyright opt-in', () => {
    const files = { 'pyproject.toml': '[tool.basedpyright]\nreportAny = false\n' };

    expect(follow({ preset: 'python' }, files).printed).toBe(
      `${fixed}Ignoring [tool.basedpyright] in pyproject.toml except its environment keys; opt in with ${optIn('pyright')}\n`,
    );
  });
});

describe('Python mypy config of the project', () => {
  const fixed = `Format with ruff: ruff format --isolated --target-version py38 --line-length 88 --config 'format.quote-style = "double"' --config 'indent-width = 4' .\n`;
  const notice = (what) =>
    `Ignoring ${what} except its environment keys; opt in with "tools": { "mypy": { "precedence": ["project", "nitpicker"] } }\n`;

  it('names the file or table that is ignored, until the project is listed', () => {
    expect(follow({ preset: 'python' }, { 'mypy.ini': '[mypy]\n' }).printed).toBe(
      fixed + notice('mypy.ini'),
    );
    expect(
      follow({ preset: 'python' }, { 'pyproject.toml': '[tool.mypy]\nstrict = false\n' }).printed,
    ).toBe(fixed + notice('[tool.mypy] in pyproject.toml'));
    expect(follow({ preset: 'python' }, { 'setup.cfg': '[mypy]\nstrict = false\n' }).printed).toBe(
      fixed + notice('[mypy] in setup.cfg'),
    );
    expect(
      follow(
        { preset: 'python', tools: { mypy: { precedence: LISTED } } },
        { 'mypy.ini': '[mypy]\n' },
      ).printed,
    ).toBe(fixed);
  });

  it('says nothing when another type checker is chosen', () => {
    const config = { preset: 'python', python: { typeChecker: 'pyright' } };

    expect(follow(config, { 'mypy.ini': '[mypy]\n' }).printed).toBe(fixed);
  });
});

describe('Python mutmut config of the project', () => {
  const fixed = `Format with ruff: ruff format --isolated --target-version py38 --line-length 88 --config 'format.quote-style = "double"' --config 'indent-width = 4' .\n`;
  const notice = (what) =>
    `Ignoring ${what} except also_copy and its process options; opt in with "tools": { "mutmut": { "precedence": ["project", "nitpicker"] } }\n`;
  const table = '[tool.mutmut]\ndo_not_mutate = ["src/*"]\n';

  it('names the table that is ignored, until the project is listed', () => {
    expect(follow({ preset: 'python' }, { 'pyproject.toml': table }).printed).toBe(
      fixed + notice('[tool.mutmut] in pyproject.toml'),
    );
    expect(
      follow({ preset: 'python' }, { 'setup.cfg': '[mutmut]\ndo_not_mutate=app/x\n' }).printed,
    ).toBe(fixed + notice('[mutmut] in setup.cfg'));
    expect(
      follow(
        { preset: 'python', tools: { mutmut: { precedence: LISTED } } },
        { 'pyproject.toml': table },
      ).printed,
    ).toBe(fixed);
  });

  it('says nothing when the table only holds what the run reads', () => {
    const read =
      '[tool.mutmut]\nalso_copy = ["data/"]\nsource_paths = ["src"]\nprocess_isolation = "forkserver"\n';

    expect(follow({ preset: 'python' }, { 'pyproject.toml': read }).printed).toBe(fixed);
  });

  it('says nothing when mutation testing is off', () => {
    const config = { preset: 'python', disable: ['mutation'] };

    expect(follow(config, { 'pyproject.toml': table }).printed).toBe(fixed);
  });
});

describe('Python coverage config of the project', () => {
  const fixed = `Format with ruff: ruff format --isolated --target-version py38 --line-length 88 --config 'format.quote-style = "double"' --config 'indent-width = 4' .\n`;
  const notice = (what) =>
    `Ignoring ${what} except omit, concurrency, patch and plugins; opt in with "tools": { "coverage": { "precedence": ["project", "nitpicker"] } }\n`;

  it('names the coverage settings that are ignored, until the project is listed', () => {
    const excluded = '[tool.coverage.report]\nexclude_also = ["def __repr__"]\n';

    expect(follow({ preset: 'python' }, { 'pyproject.toml': excluded }).printed).toBe(
      fixed + notice('[tool.coverage] in pyproject.toml'),
    );
    expect(follow({ preset: 'python' }, { '.coveragerc': '[run]\ntimid = True\n' }).printed).toBe(
      fixed + notice('.coveragerc'),
    );
    expect(
      follow(
        { preset: 'python', tools: { coverage: { precedence: LISTED } } },
        { 'pyproject.toml': excluded },
      ).printed,
    ).toBe(fixed);
  });

  it('says nothing when the config only holds what the run reads or never applies', () => {
    const read = '[coverage:run]\nomit = gen/*\n\n[coverage:report]\nfail_under = 90\n';

    expect(follow({ preset: 'python' }, { 'setup.cfg': read }).printed).toBe(fixed);
  });
});

describe('Python conventions that black can apply', () => {
  const black = { preset: 'python', python: { formatter: 'black' } };

  it('skips the indentation and says black accepts both quote styles', () => {
    expect(follow(black, { 'a.py': SINGLE_QUOTED })).toEqual({
      conventions: { 'python.quotes': 'single' },
      printed:
        HEADER +
        '  Python quotes: single quotes, black accepts both quote styles (used by 1 of 1 measured files)\n' +
        'Format with black: black --config <empty file> --line-length 88 --skip-string-normalization --target-version py38 .\n',
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
        '  Python line length: 100 columns (from your black config)\n' +
        'Format with black: black --config pyproject.toml --target-version py38 .\n',
    });
  });
});

describe('Kotlin conventions that the formatter can apply', () => {
  it('leaves out the trailing commas when ktfmt runs, and refuses a pin for them', () => {
    const files = { 'build.gradle.kts': 'ktfmt()', 'src/A.kt': NO_COMMAS, 'src/B.kt': NO_COMMAS };

    expect(follow({ preset: 'kotlin' }, files)).toEqual({
      conventions: { 'kotlin.indentation': '2' },
      printed:
        HEADER +
        '  Kotlin indentation: 2 spaces (used by 2 of 2 measured files)\n' +
        'Format with ktfmt: ktfmt --meta-style <Kotlin files>\n',
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
      conventions: {
        'kotlin.indentation': '4',
        'kotlin.trailingCommas': 'always',
        'kotlin.wildcardImports': 'wildcard',
      },
      printed:
        HEADER +
        '  Kotlin indentation: 4 spaces (from your .editorconfig)\n' +
        '  Kotlin trailing commas: required in wrapped lists (from your .editorconfig)\n' +
        '  Kotlin imports: wildcards allowed (from your detekt config)\n' +
        'ktlint reads your .editorconfig files, and uses indent_size = 4, ktlint_standard_no-wildcard-imports = disabled where they set nothing; the followed limits (indent_size) win over them\n',
    });
  });

  it('follows the line length and prints it with the ktfmt command', () => {
    const wide = `fun f() {\n  g(${'a'.repeat(105)},\n    1)\n  g(${'b'.repeat(112)},\n    2)\n}\n`;
    const files = { 'build.gradle.kts': 'ktfmt()', 'src/A.kt': wide, 'src/B.kt': wide };

    expect(follow({ preset: 'kotlin' }, files)).toEqual({
      conventions: { 'kotlin.indentation': '2', 'kotlin.lineLength': '120' },
      printed:
        HEADER +
        '  Kotlin indentation: 2 spaces (used by 2 of 2 measured files)\n' +
        '  Kotlin line length: 120 columns (used by 2 of 2 measured files)\n' +
        'Format with ktfmt: ktfmt --meta-style --max-width=120 <Kotlin files>\n',
    });
  });

  it('takes the line length from the .editorconfig and the detekt config when they are listed', () => {
    const config = {
      preset: 'kotlin',
      tools: { ktlint: { precedence: LISTED }, detekt: { precedence: LISTED } },
    };
    const editorconfig = '[*.{kt,kts}]\nmax_line_length = 120\n';
    const detekt = 'style:\n  MaxLineLength:\n    maxLineLength: 100\n';

    expect(
      follow(config, { 'build.gradle.kts': 'ktlint', '.editorconfig': editorconfig }).conventions,
    ).toEqual({ 'kotlin.lineLength': '120' });
    expect(
      follow(
        { preset: 'kotlin', tools: { detekt: { precedence: LISTED } } },
        { 'build.gradle.kts': 'plugins {}', 'detekt.yml': detekt },
      ).conventions,
    ).toBeUndefined();
    expect(
      follow(config, {
        'build.gradle.kts': 'ktlint',
        '.editorconfig': 'root = true\n',
        'config/detekt/detekt.yml': detekt,
      }).conventions,
    ).toEqual({ 'kotlin.lineLength': '100' });
  });

  it('follows a line length that is none of 100, 120 and 140', () => {
    const ktlint = { preset: 'kotlin', tools: { ktlint: { precedence: LISTED } } };
    const both = { ...ktlint, tools: { ...ktlint.tools, detekt: { precedence: LISTED } } };

    expect(
      follow(ktlint, {
        'build.gradle.kts': 'ktlint',
        '.editorconfig': '[*.{kt,kts}]\nmax_line_length = 110\n',
      }),
    ).toEqual({
      conventions: { 'kotlin.lineLength': '110' },
      printed:
        HEADER +
        '  Kotlin line length: 110 columns (from your .editorconfig)\n' +
        'ktlint reads your .editorconfig files, and uses max_line_length = 110 where they set nothing; the followed limits (max_line_length) win over them\n',
    });
    expect(
      follow(both, {
        'build.gradle.kts': 'ktlint',
        '.editorconfig': 'root = true\n',
        'config/detekt/detekt.yml': 'style:\n  MaxLineLength:\n    maxLineLength: 160\n',
      }).conventions,
    ).toEqual({ 'kotlin.lineLength': '160' });
  });

  it('accepts a pinned line length of any number of columns', () => {
    const config = { preset: 'kotlin', conventions: { 'kotlin.lineLength': '110' } };

    expect(
      follow(config, { 'build.gradle.kts': 'ktlint', 'src/A.kt': TWO_SPACES }).conventions,
    ).toEqual({ 'kotlin.indentation': '2', 'kotlin.lineLength': '110' });
  });

  it('refuses a pinned line length when no formatter runs', () => {
    expect(() =>
      follow({ preset: 'kotlin', conventions: { 'kotlin.lineLength': '120' } }, { 'src/A.kt': '' }),
    ).toThrow('"conventions.kotlin.lineLength" has no effect: no Kotlin formatter runs');
  });
});
