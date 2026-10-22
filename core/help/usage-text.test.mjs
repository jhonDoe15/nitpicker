import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runCli } from '../cli.mjs';
import { parseArguments } from '../command/arguments.mjs';
import { useProjects } from '../init/test-support/projects.mjs';
import { packageVersion } from './package-version.mjs';
import { COMMANDS, FLAGS, INIT_FLAGS, INIT_USAGE_TEXT, USAGE_TEXT } from './usage-text.mjs';

const project = useProjects();
const MANIFEST = new URL('../../package.json', import.meta.url);
const EXPECTED_USAGE = [
  'Usage: nitpicker [--base <ref>] [--output <dir>] [--all | --fix] [--analyzer <name>]...',
  '                 [--rule <substring>]... [--shard-count <n> --shard-index <i>] [--defer-exit]',
  '                 [--no-cache] [--accept-policy-change=<digest>] [--help] [--version]',
  '       nitpicker init [--agents-md] [--ci github] [--help]',
  '       nitpicker aggregate --input-root <dir> --shard-count <n> [--output <dir>] [--policy-root <dir>]',
  '       nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>]',
  '',
  'Commands:',
  '  nitpicker                Compare your changes with the merge base and fail on the problems they add.',
  '  nitpicker init           Detect the project and set it up: config, install command, agent skill.',
  '  nitpicker aggregate      Combine the reports of sharded runs into one result.',
  '  nitpicker cache publish  Upload the findings of HEAD to the remote cache.',
  '',
  'Options:',
  '  --all                            Report every finding in the checkout, with no baseline.',
  '  --base <ref>                     Compare against this ref instead of the detected base.',
  '  --fix                            Apply ESLint and Prettier fixes to the changed files, then compare.',
  '  --analyzer <name>                Run only this analyzer (repeatable).',
  '  --rule <substring>               List the findings whose rule matches (repeatable).',
  '  --output <dir>                   Write the reports to this directory.',
  '  --shard-count <n>                Split the analyzers over n jobs (with --shard-index).',
  '  --shard-index <i>                Run shard i of the split (0 to n-1).',
  '  --defer-exit                     Exit 0 after writing the reports; for shard jobs before aggregate.',
  '  --no-cache                       Do not read or write the findings cache.',
  '  --accept-policy-change=<digest>  Accept a reviewed loosening of the config (people only).',
  '  --help                           Print this help.',
  '  --version                        Print the installed nitpicker version.',
  '',
  'Start a new project with nitpicker init. Reference: https://github.com/jhonDoe15/nitpicker/blob/main/docs/usage.md',
  '',
].join('\n');
const EXPECTED_INIT_USAGE = [
  'Usage: nitpicker init [--agents-md] [--ci github] [--help]',
  '',
  'Detects the language, build tool, test runner and package manager, writes a minimal',
  'nitpicker.config.json, and prints the missing peers, the agent skill to install and the',
  'command to run. It never overwrites a file: for an existing file it prints a diff and exits 1.',
  '',
  'Options:',
  '  --agents-md  Append the agent guidance snippet to AGENTS.md (CLAUDE.md if only that exists).',
  '  --ci github  Write .github/workflows/nitpicker.yml.',
  '  --help       Print this help.',
  '',
].join('\n');

function run(...cliArguments) {
  let stdoutText = '';
  let stderrText = '';
  const exitCode = runCli({
    arguments_: cliArguments,
    stdout: { write: (text) => (stdoutText += text) },
    stderr: { write: (text) => (stderrText += text) },
  });
  return { exitCode, stdoutText, stderrText };
}

describe('nitpicker --help', () => {
  it('prints the usage of every command, every command and every flag, and exits 0', () => {
    expect(run('--help')).toEqual({ exitCode: 0, stdoutText: EXPECTED_USAGE, stderrText: '' });
    expect(USAGE_TEXT).toBe(EXPECTED_USAGE);
  });

  it('lists every command with its description', () => {
    expect(COMMANDS.map(([name]) => name)).toEqual([
      'nitpicker',
      'nitpicker init',
      'nitpicker aggregate',
      'nitpicker cache publish',
    ]);
  });

  it('lists every flag the comparison command accepts, and each one parses', () => {
    const accepted = [
      ['--all'],
      ['--base', 'ref'],
      ['--fix'],
      ['--analyzer', 'name'],
      ['--rule', 'text'],
      ['--output', 'dir'],
      ['--shard-count', '2', '--shard-index', '0'],
      ['--defer-exit'],
      ['--no-cache'],
      ['--accept-policy-change=abc'],
      ['--help'],
      ['--version'],
    ];

    const acceptedFlags = accepted
      .flat()
      .filter((argument) => argument.startsWith('--'))
      .map((argument) => argument.split('=')[0]);

    expect(FLAGS.map(([flag]) => flag.split(/[ =]/u)[0])).toEqual(acceptedFlags);
    for (const cliArguments of accepted) {
      expect(() => parseArguments(cliArguments), cliArguments[0]).not.toThrow();
    }
  });

  it('describes every flag in one sentence', () => {
    for (const [, description] of [...FLAGS, ...INIT_FLAGS]) {
      expect(description).toMatch(/^[A-Z][^\n]*\.$/u);
    }
  });

  it('describes the init flags in init --help', () => {
    expect(INIT_USAGE_TEXT).toBe(EXPECTED_INIT_USAGE);
    expect(INIT_FLAGS.map(([flag]) => flag)).toEqual(['--agents-md', '--ci github', '--help']);
  });
});

describe('nitpicker --version', () => {
  it('prints the version of package.json', () => {
    const { version } = JSON.parse(readFileSync(MANIFEST, 'utf8'));

    expect(run('--version')).toEqual({ exitCode: 0, stdoutText: `${version}\n`, stderrText: '' });
    expect(packageVersion()).toBe(version);
  });

  it('reads the version of the package folder it is given', () => {
    expect(packageVersion(project({ 'package.json': '{"version":"9.9.9"}' }))).toBe('9.9.9');
  });

  it('is accepted next to other flags and loses to --help', () => {
    expect(run('--all', '--version').stdoutText).toBe(`${packageVersion()}\n`);
    expect(run('--help', '--version').stdoutText).toBe(EXPECTED_USAGE);
  });
});
