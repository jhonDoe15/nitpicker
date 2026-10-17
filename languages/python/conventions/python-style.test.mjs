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

  it('names the file when the project config does not parse', () => {
    const { projectRoot, lines } = summaryOf({ 'ruff.toml': 'line-length = \n' }, ['nitpicker']);

    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('Could not read the Python formatting settings: ')).toBe(true);
    expect(lines[0].includes(`${path.join(projectRoot, 'ruff.toml')} is not valid TOML`)).toBe(
      true,
    );
  });
});
