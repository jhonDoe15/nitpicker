import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runCli } from '../cli.mjs';
import { COMPARISON_OPTIONS, parseArguments } from '../command/arguments.mjs';
import { CACHE_PUBLISH_OPTIONS } from '../command/cache.mjs';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { AGGREGATE_OPTIONS } from '../diff/sharding/arguments.mjs';
import { INIT_OPTIONS } from '../init/init-arguments.mjs';
import { packageVersion } from './package-version.mjs';
import {
  AGGREGATE_FLAGS,
  CACHE_PUBLISH_FLAGS,
  COMMANDS,
  FLAGS,
  INIT_FLAGS,
  INIT_USAGE_TEXT,
  USAGE_TEXT,
} from './usage-text.mjs';

const { temporaryRoot } = useGitFixtures();
const MANIFEST = new URL('../../package.json', import.meta.url);
const PAIRED = { '--shard-count': ['--shard-index', '0'], '--shard-index': ['--shard-count', '2'] };
const EXPECTED_USAGE = [
  'Usage: nitpicker [--base <ref>] [--output <dir>] [--all | --fix] [--analyzer <name>]...',
  '                 [--rule <substring>]... [--details] [--shard-count <n> --shard-index <i>]',
  '                 [--defer-exit] [--no-cache] [--accept-policy-change=<digest>] [--help] [--version]',
  '       nitpicker init [--agents-md] [--ci github] [--help]',
  '       nitpicker aggregate --input-root <dir> --shard-count <n> [--output <dir>] [--policy-root <dir>] [--details]',
  '       nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>] [--help]',
  '       nitpicker base [--base <ref>]',
  '       nitpicker explain <tool/rule>...',
  '       nitpicker rules [--preset <name>] [--tool <name>]',
  '',
  'Commands:',
  '  nitpicker                Compare your changes with the merge base and fail on the problems they add.',
  '  nitpicker init           Detect the project and set it up: config, install command, agent skill.',
  '  nitpicker aggregate      Combine the reports of sharded runs into one result.',
  '  nitpicker cache publish  Upload the findings of HEAD to the remote cache.',
  '  nitpicker base           Print the base ref a run would compare with.',
  '  nitpicker explain        Print what the rule reference says about the rules named.',
  '  nitpicker rules          List the rules the preset of the project reports.',
  '',
  'Options:',
  '  --all                            Report every finding in the checkout, with no baseline.',
  '  --base <ref>                     Compare against this ref instead of the detected base.',
  '  --fix                            Apply ESLint and Prettier fixes to the changed files, then compare.',
  '  --analyzer <name>                Run only this analyzer (repeatable).',
  '  --rule <substring>               List the findings whose rule matches (repeatable).',
  '  --details                        Print every new and held finding with its full message.',
  '  --output <dir>                   Write the reports to this directory.',
  '  --shard-count <n>                Split the analyzers over n jobs (with --shard-index).',
  '  --shard-index <i>                Run shard i of the split (0 to n-1).',
  '  --defer-exit                     Exit 0 after writing the reports; for shard jobs before aggregate.',
  '  --no-cache                       Do not read or write the findings cache.',
  '  --accept-policy-change=<digest>  Accept a reviewed loosening of the config (people only).',
  '  --help                           Print this help.',
  '  --version                        Print the installed nitpicker version.',
  '',
  'Options of nitpicker init:',
  '  --agents-md  Append the agent guidance snippet to AGENTS.md (CLAUDE.md if only that exists).',
  '  --ci github  Write a GitHub Actions workflow that runs nitpicker on pull requests.',
  '  --help       Print this help.',
  '',
  'Options of nitpicker aggregate:',
  '  --input-root <dir>   Read the shard reports from <dir>/0 to <dir>/n-1.',
  '  --shard-count <n>    The number of shards the run was split into.',
  '  --output <dir>       Write the combined reports here (default reports/quality/diff/combined).',
  '  --policy-root <dir>  Read the analyzer configuration from this folder, not the head commit.',
  '  --details            Print every new and held finding with its full message.',
  '  --help               Print this help.',
  '',
  'Options of nitpicker cache publish:',
  '  --analyzer <name>  Publish only this analyzer (repeatable).',
  '  --shard-count <n>  Split the analyzers over n jobs (with --shard-index).',
  '  --shard-index <i>  Publish shard i of the split (0 to n-1).',
  '  --help             Print this help.',
  '',
  'Start a new project with nitpicker init. Reference: https://github.com/jhonDoe15/nitpicker/blob/main/docs/usage.md',
  '',
].join('\n');
const EXPECTED_INIT_USAGE = [
  'Usage: nitpicker init [--agents-md] [--ci github] [--help]',
  '',
  'Detects the language, build tool, test runner and package manager, writes a minimal',
  'nitpicker.config.json, and prints the missing peers, the agent skill to install and the',
  'command to run. It never overwrites a file: when an existing file needs a change, it prints',
  'the diff and exits 1. It exits 0 when everything is set up, and 2 when it cannot run (no',
  'project, no Git repository, Node.js older than the package needs, a folder, file or link in',
  'the way of a file it writes, or an unknown argument).',
  '',
  'Options:',
  '  --agents-md  Append the agent guidance snippet to AGENTS.md (CLAUDE.md if only that exists).',
  '  --ci github  Write a GitHub Actions workflow that runs nitpicker on pull requests.',
  '  --help       Print this help.',
  '',
].join('\n');
const EXPECTED_AGGREGATE_USAGE = [
  'Usage: nitpicker aggregate --input-root <dir> --shard-count <n> [--output <dir>] [--policy-root <dir>] [--details]',
  '',
  'Combines the reports of the shard jobs (run with --shard-count, --shard-index and --defer-exit)',
  'into one result, with the exit codes of a normal run.',
  '',
  'Options:',
  '  --input-root <dir>   Read the shard reports from <dir>/0 to <dir>/n-1.',
  '  --shard-count <n>    The number of shards the run was split into.',
  '  --output <dir>       Write the combined reports here (default reports/quality/diff/combined).',
  '  --policy-root <dir>  Read the analyzer configuration from this folder, not the head commit.',
  '  --details            Print every new and held finding with its full message.',
  '  --help               Print this help.',
  '',
].join('\n');
const EXPECTED_CACHE_PUBLISH_USAGE = [
  'Usage: nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>] [--help]',
  '',
  'Analyzes the committed HEAD tree and uploads its findings to the remote cache',
  '(NITPICKER_CACHE_URL), so later branches reuse them as their base.',
  '',
  'Options:',
  '  --analyzer <name>  Publish only this analyzer (repeatable).',
  '  --shard-count <n>  Split the analyzers over n jobs (with --shard-index).',
  '  --shard-index <i>  Publish shard i of the split (0 to n-1).',
  '  --help             Print this help.',
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

function flagNames(rows) {
  return rows.map(([flag]) => flag.split(/[ =]/u)[0]).toSorted();
}

function sampleArguments(flag) {
  const [name, placeholder] = flag.split(/[ =]/u);
  if (placeholder === undefined) {
    return [name];
  }
  const sample = flag.includes('=') ? [`${name}=abc`] : [name, '1'];
  return [...sample, ...(PAIRED[name] ?? [])];
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
      'nitpicker base',
      'nitpicker explain',
      'nitpicker rules',
    ]);
  });

  it('lists exactly the flags each command parses', () => {
    expect(flagNames(FLAGS)).toEqual(COMPARISON_OPTIONS.toSorted());
    expect(flagNames(INIT_FLAGS)).toEqual(INIT_OPTIONS.toSorted());
    expect(flagNames(AGGREGATE_FLAGS)).toEqual(AGGREGATE_OPTIONS.toSorted());
    expect(flagNames(CACHE_PUBLISH_FLAGS)).toEqual(CACHE_PUBLISH_OPTIONS.toSorted());
  });

  it.each(FLAGS)('parses %s in the form the help shows', (flag) => {
    expect(() => parseArguments(sampleArguments(flag))).not.toThrow();
  });

  it('describes every flag in one sentence', () => {
    const rows = [...FLAGS, ...INIT_FLAGS, ...AGGREGATE_FLAGS, ...CACHE_PUBLISH_FLAGS];
    const notOneSentence = rows.filter(([, description]) => !/^[A-Z][^\n]*\.$/u.test(description));

    expect(notOneSentence).toEqual([]);
  });
});

describe('the help of each command', () => {
  it('describes the init flags in init --help', () => {
    expect(INIT_USAGE_TEXT).toBe(EXPECTED_INIT_USAGE);
    expect(run('init', '--help')).toEqual({
      exitCode: 0,
      stdoutText: EXPECTED_INIT_USAGE,
      stderrText: '',
    });
  });

  it('names the public command in aggregate --help', () => {
    expect(run('aggregate', '--help')).toEqual({
      exitCode: 0,
      stdoutText: EXPECTED_AGGREGATE_USAGE,
      stderrText: '',
    });
  });

  it('prints the help of cache publish and exits 0', () => {
    const expected = { exitCode: 0, stdoutText: EXPECTED_CACHE_PUBLISH_USAGE, stderrText: '' };

    expect(run('cache', 'publish', '--help')).toEqual(expected);
    expect(run('cache', '--help')).toEqual(expected);
  });

  it('refuses a flag that cache publish does not take', () => {
    expect(run('cache', 'publish', '--rule', 'x')).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText:
        'nitpicker failed: Unknown argument: --rule. Usage: nitpicker cache publish' +
        ' [--analyzer <name>]... [--shard-count <n> --shard-index <i>]\n',
    });
  });
});

describe('nitpicker --version', () => {
  it('prints the version of package.json', () => {
    const { version } = JSON.parse(readFileSync(MANIFEST, 'utf8'));

    expect(run('--version')).toEqual({ exitCode: 0, stdoutText: `${version}\n`, stderrText: '' });
    expect(packageVersion()).toBe(version);
  });

  it('reads the version of the package folder it is given', () => {
    const root = temporaryRoot('nitpicker-version-');
    writeFiles(root, { 'package.json': '{"version":"9.9.9"}' });

    expect(packageVersion(root)).toBe('9.9.9');
  });

  it('is accepted next to other flags and loses to --help', () => {
    expect(run('--all', '--version').stdoutText).toBe(`${packageVersion()}\n`);
    expect(run('--help', '--version').stdoutText).toBe(EXPECTED_USAGE);
  });
});
