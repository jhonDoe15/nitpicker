import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../cli.mjs';
import { policy } from '../diff/execution/test-support/analyzer-findings.mjs';
import { fixtureGit } from '../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
import { useCliFixtures } from '../command/test-support/cli-harness.mjs';

const { createRepository, makeOutputRoot, makeTemporaryRoot } = useCliFixtures(nitpickerCli);

const CLI_URL = pathToFileURL(path.resolve(import.meta.dirname, '../cli.mjs')).href;
const EMPTY_REPORT = String.raw`process.stdout.write(JSON.stringify({ findings: [] }) + '\n');`;

function hookScript({ baseRef, outputRoot, flags, exitFile }) {
  const analyzer = {
    name: 'empty-analyzer',
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
    findingExitCodes: [1],
  };
  return [
    "import { writeFileSync } from 'node:fs';",
    `import { runCli } from ${JSON.stringify(CLI_URL)};`,
    `const analyzer = { ...${JSON.stringify(analyzer)}, createInvocation: ({ policyRoot }) => ({`,
    `  command: process.execPath, args: ['--input-type=module', '--eval', ${JSON.stringify(EMPTY_REPORT)}], cwd: policyRoot }) };`,
    'const exitCode = runCli({',
    `  arguments_: ${JSON.stringify(['--base', baseRef, '--output', outputRoot, ...flags])},`,
    '  analyzers: [analyzer], currentProjectRoot: process.cwd(),',
    '  stdout: { write() {} }, stderr: { write() {} }, progress: { write() {} },',
    '});',
    `writeFileSync(${JSON.stringify(exitFile)}, String(exitCode));`,
  ].join('\n');
}

function installHook(project, flags) {
  const scriptRoot = makeTemporaryRoot('nitpicker-hook-script-');
  const script = path.join(scriptRoot, 'hook.mjs');
  const exitFile = path.join(scriptRoot, 'exit-code');
  writeFileSync(
    script,
    hookScript({ baseRef: project.baseRef, outputRoot: makeOutputRoot(), flags, exitFile }),
  );
  const hook = path.join(project.root, '.git/hooks/pre-commit');
  writeFileSync(
    hook,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)}\n`,
  );
  chmodSync(hook, 0o755);
  return exitFile;
}

function committedFiles(root) {
  return fixtureGit(root, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n');
}

function stagedFiles(root) {
  return fixtureGit(root, ['diff', '--cached', '--name-only']).trim().split('\n');
}

describe('nitpicker inside a pre-commit hook', () => {
  it.each([[['--quick']], [['--staged', '--quick']]])(
    'leaves the index of a `git commit <path>` alone with %j',
    (flags) => {
      const project = createRepository({ 'quality-policy.json': policy() });
      writeFiles(project.root, { 'src/main/a.ts': 'export const a = 1;\n' });
      fixtureGit(project.root, ['add', '--', 'src/main/a.ts']);
      writeFiles(project.root, { 'src/main/b.ts': 'export const b = 1;\n' });
      fixtureGit(project.root, ['add', '-N', '--', 'src/main/b.ts']);
      const exitFile = installHook(project, flags);

      fixtureGit(project.root, ['commit', '-q', '-m', 'only b', 'src/main/b.ts']);

      expect(readFileSync(exitFile, 'utf8')).toBe('0');
      expect(committedFiles(project.root)).toEqual(['src/main/b.ts']);
      expect(stagedFiles(project.root)).toEqual(['src/main/a.ts']);
    },
  );
});
