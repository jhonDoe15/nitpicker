import {
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../core/diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree } from '../../../core/fix/run-fix.mjs';
import { resolveHeadPolicy } from '../preset/head-policy.mjs';

const { createGitRepository } = useGitFixtures();

function topic(committed, changed) {
  const repository = createGitRepository(committed, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changed);
  return repository;
}

function eslintReply(repository, outputs, fatal = []) {
  const reported = [...new Set([...Object.keys(outputs), ...fatal])];
  return {
    status: 1,
    stdout: JSON.stringify(
      reported.map((name) => ({
        filePath: path.join(repository.root, name),
        output: outputs[name],
        messages: fatal.includes(name) ? [{ fatal: true, message: 'Parsing error' }] : [],
      })),
    ),
    stderr: '',
  };
}

function fix(repository, eslint) {
  const operations = [];
  const result = fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    executeFixCommand: (invocation) => {
      operations.push(invocation.operation);
      return invocation.operation === 'eslint-fix' ? eslint(invocation) : undefined;
    },
  });
  return { ...result, operations };
}

function read(repository, name) {
  return readFileSync(path.join(repository.root, name), 'utf8');
}

describe('fixTypeScript', () => {
  it('writes the ESLint output itself, keeping a CRLF file CRLF and its mode', () => {
    const repository = topic(
      { 'src/a.ts': 'let a=1;\r\nexport { a };\r\n' },
      { 'src/a.ts': 'let a=2;\r\nexport { a };\r\n' },
    );
    chmodSync(path.join(repository.root, 'src/a.ts'), 0o640);
    const result = fix(repository, () =>
      eslintReply(repository, { 'src/a.ts': 'const a=2;\r\n\nexport { a };\r\n' }),
    );

    expect(read(repository, 'src/a.ts')).toBe('const a=2;\r\n\r\nexport { a };\r\n');
    expect(statSync(path.join(repository.root, 'src/a.ts')).mode & 0o777).toBe(0o640);
    expect(result).toEqual({
      fixedFiles: ['src/a.ts'],
      toolErrors: [],
      notes: [
        'eslint --fix rewrote src/a.ts',
        'prettier left src/a.ts as is: already unformatted before your change',
      ],
      operations: ['eslint-fix', 'prettier-fix', 'prettier-base-check'],
    });
  });
  it('leaves a file that changed while ESLint ran as it is', () => {
    const repository = topic({}, { 'src/a.ts': 'let a = 1;\nexport { a };\n' });
    const result = fix(repository, () => {
      writeFileSync(path.join(repository.root, 'src/a.ts'), 'let b = 2;\nexport { b };\n');
      return eslintReply(repository, { 'src/a.ts': 'const a = 1;\nexport { a };\n' });
    });

    expect(read(repository, 'src/a.ts')).toBe('let b = 2;\nexport { b };\n');
    expect(result.notes).toEqual(['--fix left src/a.ts as is: the file changed while --fix ran']);
    expect(result.toolErrors).toEqual([]);
  });
  it('reports an ESLint report that is not JSON as a tool error and still runs Prettier', () => {
    const repository = topic({}, { 'src/a.ts': 'export const a=1\n' });
    const result = fix(repository, () => ({ status: 0, stdout: 'not json', stderr: '' }));

    expect(read(repository, 'src/a.ts')).toBe('export const a = 1;\n');
    expect(result.toolErrors).toEqual([
      { tool: 'eslint-fix', snapshot: 'fix', message: 'ESLint returned invalid JSON' },
    ]);
    expect(result.notes).toEqual(['prettier rewrote src/a.ts']);
  });
  it('names symbolic links and files that are not UTF-8 once, and hands neither to a fixer', () => {
    const repository = topic({ 'src/target.ts': 'export const t=1\n' }, {});
    symlinkSync('target.ts', path.join(repository.root, 'src/link.ts'));
    writeFileSync(
      path.join(repository.root, 'src/latin.ts'),
      Buffer.from([0x2f, 0x2f, 0xe9, 0x0a]),
    );
    writeFileSync(path.join(repository.root, 'src/latin.md'), Buffer.from([0xe9, 0x0a]));
    const result = fix(repository);

    expect(read(repository, 'src/target.ts')).toBe('export const t=1\n');
    expect(readFileSync(path.join(repository.root, 'src/latin.ts'))).toEqual(
      Buffer.from([0x2f, 0x2f, 0xe9, 0x0a]),
    );
    expect(result).toEqual({
      fixedFiles: [],
      toolErrors: [],
      notes: [
        '--fix left src/latin.md, src/latin.ts as is: not UTF-8 text',
        '--fix left src/link.ts as is: symbolic links are not followed',
      ],
      operations: [],
    });
  });
  it('notes a file ESLint and Prettier cannot parse and still fixes the others', () => {
    const repository = topic(
      {},
      { 'src/broken.ts': 'export const = ;\n', 'src/fine.ts': 'export let fine=1\n' },
    );
    const result = fix(repository, () =>
      eslintReply(repository, { 'src/fine.ts': 'export const fine=1\n' }, ['src/broken.ts']),
    );

    expect(read(repository, 'src/broken.ts')).toBe('export const = ;\n');
    expect(read(repository, 'src/fine.ts')).toBe('export const fine = 1;\n');
    expect(result.toolErrors).toEqual([]);
    expect(result.notes).toEqual([
      'eslint --fix rewrote src/fine.ts',
      'eslint --fix could not parse src/broken.ts',
      'prettier rewrote src/fine.ts',
      'prettier could not parse src/broken.ts',
    ]);
  });
  it('fails the ESLint step without writing when ESLint reports a file it was not given', () => {
    const repository = topic({}, { 'src/a.ts': 'let a = 1;\nexport { a };\n' });
    const result = fix(repository, () =>
      eslintReply(repository, { 'src/other.ts': 'const other = 1;\n' }),
    );

    expect(read(repository, 'src/a.ts')).toBe('let a = 1;\nexport { a };\n');
    expect(result.toolErrors).toEqual([
      {
        tool: 'eslint-fix',
        snapshot: 'fix',
        message: `ESLint reported a file it was not given: ${path.join(repository.root, 'src/other.ts')}`,
      },
    ]);
  });
  it('counts a file deleted while ESLint ran as changed meanwhile, and Prettier as a tool error', () => {
    const repository = topic({}, { 'src/a.ts': 'let a = 1;\nexport { a };\n' });
    const result = fix(repository, () => {
      const reply = eslintReply(repository, { 'src/a.ts': 'const a = 1;\nexport { a };\n' });
      rmSync(path.join(repository.root, 'src/a.ts'));
      return reply;
    });

    expect(existsSync(path.join(repository.root, 'src/a.ts'))).toBe(false);
    expect(result).toEqual({
      fixedFiles: [],
      toolErrors: [
        {
          tool: 'prettier-fix',
          snapshot: 'fix',
          message: expect.stringMatching(/^ENOENT: no such file or directory/u),
        },
      ],
      notes: ['--fix left src/a.ts as is: the file changed while --fix ran'],
      operations: ['eslint-fix'],
    });
  });
  it("formats with the project's own Prettier config when its precedence comes first", () => {
    const repository = topic(
      { '.prettierrc.json': '{ "semi": false }\n' },
      { 'src/a.json': '{"a":1}\n', 'src/b.mjs': 'export const b=1;\n' },
    );
    const result = fixWorkingTree({
      repositoryRoot: repository.root,
      projectRoot: repository.root,
      baseRef: 'base',
      headPolicy: resolveHeadPolicy({
        tools: { prettier: { precedence: ['project', 'nitpicker'] } },
      }),
      config: { preset: 'javascript' },
      executeFixCommand: ({ operation }) =>
        operation === 'eslint-fix' ? eslintReply(repository, {}) : undefined,
    });

    expect([read(repository, 'src/a.json'), read(repository, 'src/b.mjs')]).toEqual([
      '{ "a": 1 }\n',
      'export const b = 1\n',
    ]);
    expect(result.notes).toEqual(['prettier rewrote src/a.json, src/b.mjs']);
  });
  it("gives Prettier's output the line endings of the gate's endOfLine convention", () => {
    const repository = topic({}, { 'src/a.json': '{"a":1}\r\n' });
    const result = fix(repository);

    expect(read(repository, 'src/a.json')).toBe('{ "a": 1 }\n');
    expect(result.notes).toEqual(['prettier rewrote src/a.json']);
  });
  it('leaves a file alone that changed between formatting and writing', () => {
    const repository = topic({}, { 'src/a.json': '{"a":1}\n' });
    const operations = [];
    const result = fixWorkingTree({
      repositoryRoot: repository.root,
      projectRoot: repository.root,
      baseRef: 'base',
      executeFixCommand: ({ operation }) => {
        operations.push(operation);
        writeFileSync(path.join(repository.root, 'src/a.json'), '{"b":2}\n');
        return {
          status: 0,
          stdout: JSON.stringify({ results: [{ path: 'src/a.json', formatted: '{ "a": 1 }\n' }] }),
        };
      },
    });

    expect(read(repository, 'src/a.json')).toBe('{"b":2}\n');
    expect(operations).toEqual(['prettier-fix']);
    expect(result.notes).toEqual(['--fix left src/a.json as is: the file changed while --fix ran']);
  });
});
