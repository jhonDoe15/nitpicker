import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree } from '../../../../core/fix/run-fix.mts';

const { createGitRepository } = useGitFixtures();
const SOURCE = "/** Gets the user name. */\nexport function getUserName() {\n  return 'a';\n}\n";
const FIXED = "export function getUserName() {\n  return 'a';\n}\n";

function fixTopic(analyzeFixes) {
  const repository = createGitRepository({}, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, { 'src/a.ts': SOURCE });
  const result = fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    headPolicy: { exclude: [], conventions: {} },
    config: { preset: 'typescript' },
    executeFixCommand: (invocation) =>
      invocation.operation === 'knip-fix' ? { status: 0, stdout: '', stderr: '' } : undefined,
    analyzeFixes: (request) => analyzeFixes(request, repository.root),
  });
  return { result, text: readFileSync(path.join(repository.root, 'src/a.ts'), 'utf8') };
}

function reportsTypeError(request, root) {
  const text = readFileSync(path.join(root, 'src/a.ts'), 'utf8');
  return {
    findings: text.includes('/**')
      ? []
      : [
          {
            tool: 'typescript-typecheck',
            rule: 'TS2304',
            path: 'src/a.ts',
            classification: 'enforceable',
          },
        ],
  };
}

function reportsNothing() {
  return { findings: [] };
}

describe('--fix verifies the TypeScript recipe it applied', () => {
  it('rolls back the restating doc comment recipe when it adds a type error', () => {
    const { result, text } = fixTopic(reportsTypeError);

    expect({ text, fixedFiles: result.fixedFiles, notes: result.notes }).toEqual({
      text: SOURCE,
      fixedFiles: [],
      notes: [
        '--fix rolled back typescript-restating-doc-comment (src/a.ts): breaks the compile or type check: new typescript-typecheck/TS2304 in src/a.ts',
      ],
    });
  });
  it('keeps the recipe when the analysis finds nothing new', () => {
    const { result, text } = fixTopic(reportsNothing);

    expect({ text, fixedFiles: result.fixedFiles }).toEqual({
      text: FIXED,
      fixedFiles: ['src/a.ts'],
    });
  });
});
