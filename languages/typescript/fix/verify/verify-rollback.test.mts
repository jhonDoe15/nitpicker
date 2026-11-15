import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixWorkingTree } from '../../../../core/fix/run-fix.mts';
import {
  fixOptions,
  fixtureGit,
  operationOf,
  useGitFixtures,
  writeFiles,
} from '../test-support/fix-test-support.mts';

const { createGitRepository } = useGitFixtures();
const SOURCE = "/** Gets the user name. */\nexport function getUserName() {\n  return 'a';\n}\n";
const FIXED = "export function getUserName() {\n  return 'a';\n}\n";

function fixTopic(analyzeFixes: (request: unknown, root: string) => unknown) {
  const repository = createGitRepository({}, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, { 'src/a.ts': SOURCE });
  const result = fixWorkingTree(
    fixOptions(repository.root, {
      headPolicy: { exclude: [], conventions: {} },
      config: { preset: 'typescript' },
      executeFixCommand: (invocation) =>
        operationOf(invocation) === 'knip-fix' ? { status: 0, stdout: '', stderr: '' } : undefined,
      analyzeFixes: (request: unknown) => analyzeFixes(request, repository.root),
    }),
  );
  return { result, text: readFileSync(path.join(repository.root, 'src/a.ts'), 'utf8') };
}

function reportsTypeError(_request: unknown, root: string) {
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
