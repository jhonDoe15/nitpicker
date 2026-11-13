import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree } from '../../../../core/fix/run-fix.mts';
import { fakePythonTools } from '../test-support/fake-python-fix.mjs';

const { createGitRepository } = useGitFixtures();
const PYPROJECT =
  '[project]\nname = "demo"\nversion = "1"\nrequires-python = ">=3.10"\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n';
const LOADER = [
  'import logging',
  '',
  'log  =  logging.getLogger(__name__)',
  '',
  '',
  'def load(path, name: str | None = None):',
  '    try:',
  '        data = open(path).read()',
  '    except OSError as error:',
  '        log.warning("cannot read %s: %s", path, error)',
  '        raise RuntimeError("unreadable") from None',
  '    label = name or "é"',
  '    return label, data',
  '',
].join('\n');
const TEST_FILE = 'def test_add():\n    assert  1 + 1 == 2\n';

function fixTopic(changes, selectedRules) {
  const repository = createGitRepository(
    { 'pyproject.toml': PYPROJECT, 'README.md': 'demo\n' },
    { baseRef: 'base' },
  );
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changes);
  const tools = fakePythonTools({ sourceFixes: true });
  const result = fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    executeFixCommand: tools.executeFixCommand,
    headPolicy: { exclude: [], conventions: {} },
    config: { preset: 'python' },
    selectedRules,
  });
  return {
    result,
    tools,
    read: (name) => readFileSync(path.join(repository.root, name), 'utf8'),
    exists: (name) => existsSync(path.join(repository.root, name)),
  };
}

const EXC_INFO = LOADER.replace('path, error)', 'path, error, exc_info=True)');
const GUARDED = LOADER.replace('name or "é"', 'name if name is not None else "é"');

function squeezed(text) {
  return text.replaceAll(/ {2,}/g, ' ');
}

describe('--fix for Python source recipes', () => {
  it('applies the safe recipe by default and formats last', () => {
    const { result, tools, read } = fixTopic({ 'app/load.py': LOADER });

    expect(read('app/load.py')).toBe(squeezed(EXC_INFO));
    expect(result.fixedFindings).toEqual([
      'app/load.py:10 python-rules/catch-log-without-exception (python-exc-info)',
    ]);
    expect(tools.operations()).toEqual(['python-probe', 'ruff-fix', 'ruff-format-fix']);
    expect(tools.callsOf('ruff-fix')[0].input).toBe(EXC_INFO);
    expect(tools.callsOf('ruff-format-fix')[0].input).toBe(EXC_INFO);
  });

  it('applies review recipes for the selected rules before ruff and the formatter', () => {
    const { result, tools, read } = fixTopic({ 'app/load.py': LOADER }, [
      'python-rules/falsy-default',
    ]);

    expect(read('app/load.py')).toBe(squeezed(GUARDED));
    expect(result.fixedFiles).toEqual(['app/load.py']);
    expect(tools.callsOf('ruff-fix')).toEqual([]);
    expect(tools.callsOf('ruff-format-fix')[0].input).toBe(GUARDED);
  });

  it('renames an uncollected test file and formats it under the new name', () => {
    const { result, tools, read, exists } = fixTopic({ 'tests/check_math.py': TEST_FILE }, [
      'python-rules/uncollected-tests',
    ]);

    expect([
      exists('tests/check_math.py'),
      read('tests/test_check_math.py'),
      result.fixedFiles,
      tools.callsOf('ruff-format-fix').map(({ args }) => args.at(-2)),
    ]).toEqual([
      false,
      'def test_add():\n assert 1 + 1 == 2\n',
      ['tests/test_check_math.py'],
      ['--stdin-filename=tests/test_check_math.py'],
    ]);
  });
});
