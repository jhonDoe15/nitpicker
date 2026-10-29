import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScratch } from '../adapters/test-support/scratch.mjs';
import { pythonStyle } from './python-style.mjs';

const scratch = createScratch();

afterEach(scratch.cleanup);

const summaryOf = (files, precedence) => {
  const projectRoot = scratch.write(scratch.directory(), files);
  const config = { python: { formatter: 'ruff' }, tools: { ruff: { precedence } } };
  return { projectRoot, lines: pythonStyle({ config, projectRoot }).summary({}) };
};

describe('the Python formatting summary', () => {
  it('prints the command the run uses', () => {
    const { lines } = summaryOf({ 'ruff.toml': 'line-length = 100\n' }, ['nitpicker']);

    expect(lines[0]).toBe(
      "Format with ruff: ruff format --isolated --target-version py38 --line-length 88 --config 'format.quote-style = \"double\"' --config 'indent-width = 4' .",
    );
  });

  it('names the ruff config the lint ignores when black formats, until ruff opts in', () => {
    const projectRoot = scratch.write(scratch.directory(), {
      'pyproject.toml': '[tool.black]\nline-length = 88\n\n[tool.ruff.lint]\nselect = ["D"]\n',
    });
    const linesWith = (tools) =>
      pythonStyle({ config: { python: { formatter: 'black' }, tools }, projectRoot }).summary({});
    const notice =
      'Ignoring [tool.ruff] in pyproject.toml except lint.flake8-pytest-style; opt in with "tools": { "ruff": { "precedence": ["project", "nitpicker"] } }';

    expect(linesWith({})).toContain(notice);
    expect(linesWith({ ruff: { precedence: ['project'] } })).not.toContain(notice);
  });

  it('names the project options that replace the ones of nitpicker rules when it is first', () => {
    const files = {
      'ruff.toml': [
        '[lint]',
        'dummy-variable-rgx = ".*"',
        '',
        '[lint.pep8-naming]',
        'ignore-names = ["*"]',
        '',
        '[lint.pydocstyle]',
        'convention = "google"',
        '',
      ].join('\n'),
    };
    const lintLine = (precedence) =>
      summaryOf(files, precedence).lines.filter((line) => line.startsWith('ruff check: '));

    expect(lintLine(['project', 'nitpicker'])).toEqual([
      "ruff check: the project's dummy-variable-rgx, pep8-naming replace nitpicker's for its own rules",
    ]);
    expect(lintLine(['nitpicker', 'project'])).toEqual([]);
    expect(lintLine(['nitpicker'])).toEqual([]);
  });

  it('names the file when the project config does not parse', () => {
    const { projectRoot, lines } = summaryOf({ 'ruff.toml': 'line-length = \n' }, ['nitpicker']);

    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('Could not read the Python formatting settings: ')).toBe(true);
    expect(lines[0].includes(`${path.join(projectRoot, 'ruff.toml')} is not valid TOML`)).toBe(
      true,
    );
  });
});
