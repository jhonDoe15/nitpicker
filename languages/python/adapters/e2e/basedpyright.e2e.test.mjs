import { cpSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  command,
  commitBranch,
  enforceable,
  gate,
  git,
  removeRepositories,
  repository,
} from './helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const fixture = path.resolve(import.meta.dirname, '../fixtures/python-project');
const PYPROJECT = readFileSync(path.join(fixture, 'pyproject.toml'), 'utf8');
const TYPE_ERROR = 'def double(value: int) -> str:\n    return value * 2\n';
const NO_MUTATION = '{ "preset": "python", "disable": ["mutation"] }\n';
const CONFIGURED = `${PYPROJECT}\n[tool.basedpyright]\nreportMissingImports = true\n`;
const WEAKENED = `${PYPROJECT}\n[tool.basedpyright]\ntypeCheckingMode = "off"\nignore = ["src/demo/typed.py"]\nexclude = ["src/demo/typed.py"]\n`;

describe.skipIf(!enabled)('Python preset with basedpyright end to end', () => {
  let project;

  beforeAll(() => {
    project = repository();
    cpSync(fixture, project, { recursive: true });
    git(project, 'init', '-q', '-b', 'main');
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'base');
    command(project, 'uv', ['venv', '-q', '.venv']);
    command(project, 'uv', [
      'pip',
      'install',
      '-q',
      '--python',
      '.venv',
      '-e',
      '.',
      'coverage',
      'pytest',
    ]);
    commitBranch(project, 'configured', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyproject.toml': CONFIGURED,
      'nitpicker.config.json': NO_MUTATION,
    });
    commitBranch(project, 'weakened', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyproject.toml': WEAKENED,
      'nitpicker.config.json': NO_MUTATION,
    });
  });

  afterAll(removeRepositories);

  it('runs basedpyright when the project configures it, in the same strict mode', () => {
    const result = gate(project, 'configured');

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('summary.json').tools[0].version).toMatch(
      /^ruff@[\d.]+;basedpyright@[\d.]+;coverage@[\d.]+;pytest@[\d.]+;jscpd@[\d.]+$/,
    );
    expect(enforceable(result)).toEqual(['basedpyright reportReturnType typed.py']);
  });

  it('keeps checking when the project config switches basedpyright off for the file', () => {
    const result = gate(project, 'weakened');

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual(['basedpyright reportReturnType typed.py']);
  });
});
