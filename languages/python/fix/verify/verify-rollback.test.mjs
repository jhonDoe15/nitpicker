import { readFileSync } from 'node:fs';
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
const PYPROJECT = '[project]\nname = "demo"\nversion = "1"\nrequires-python = ">=3.10"\n';
const LOADER = [
  'import logging',
  '',
  'log = logging.getLogger(__name__)',
  '',
  '',
  'def load(path):',
  '    try:',
  '        return open(path).read()',
  '    except OSError as error:',
  '        log.warning("cannot read %s: %s", path, error)',
  '        raise RuntimeError("unreadable") from None',
  '',
].join('\n');
const FINDING = {
  tool: 'python-rules',
  rule: 'catch-log-without-exception',
  path: 'app/load.py',
  classification: 'enforceable',
};

function fixTopic(analyzeFixes) {
  const repository = createGitRepository({ 'pyproject.toml': PYPROJECT }, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, { 'app/load.py': LOADER });
  const result = fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    executeFixCommand: fakePythonTools({ sourceFixes: true }).executeFixCommand,
    headPolicy: { exclude: [], conventions: {} },
    config: { preset: 'python' },
    analyzeFixes: (request) => analyzeFixes(request, repository.root),
  });
  return { result, text: readFileSync(path.join(repository.root, 'app/load.py'), 'utf8') };
}

function stillReported() {
  return { findings: [FINDING] };
}

function reportsWhenMissing(request, root) {
  const text = readFileSync(path.join(root, 'app/load.py'), 'utf8');
  return { findings: text.includes('exc_info=True') ? [] : [FINDING] };
}

describe('--fix verifies the Python recipe it applied', () => {
  it('rolls back python-exc-info when its finding is still reported', () => {
    const { result, text } = fixTopic(stillReported);

    expect({ text, fixedFiles: result.fixedFiles, notes: result.notes }).toEqual({
      text: LOADER,
      fixedFiles: [],
      notes: [
        '--fix rolled back python-exc-info (app/load.py): python-rules/catch-log-without-exception is still reported in app/load.py',
      ],
    });
  });
  it('keeps python-exc-info when the finding is gone', () => {
    const { result, text } = fixTopic(reportsWhenMissing);

    expect({ text, fixedFiles: result.fixedFiles }).toEqual({
      text: LOADER.replace('path, error)', 'path, error, exc_info=True)').replaceAll(
        / {2,}/gu,
        ' ',
      ),
      fixedFiles: ['app/load.py'],
    });
  });
});
