import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../cli.mts';
import { COMPARISON_OPTIONS, parseArguments } from '../command/arguments.mts';
import { CACHE_PUBLISH_OPTIONS } from '../command/cache.mts';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { AGGREGATE_OPTIONS } from '../diff/sharding/arguments.mts';
import { INIT_OPTIONS } from '../init/init-arguments.mts';
import { packageVersion } from './package-version.mts';
import {
  AGGREGATE_FLAGS,
  CACHE_PUBLISH_FLAGS,
  COMMANDS,
  FLAGS,
  INIT_FLAGS,
  INIT_USAGE_TEXT,
} from './usage-text.mts';
import { docsUrl } from '../../shared/messages/docs-url.mjs';

const { temporaryRoot, createGitRepository } = useGitFixtures();
const MANIFEST = new URL('../../package.json', import.meta.url);
const PAIRED = { '--shard-count': ['--shard-index', '0'], '--shard-index': ['--shard-count', '2'] };
const USAGE_LINK = docsUrl('docs/usage.md');
const EXPECTED_USAGE_HEAD = [
  'Usage: nitpicker [<path>...] [--base <ref>] [--output <dir>] [--all | --fix] [--analyzer <name>]...',
  '                 [--rule <substring>]... [--details] [--json] [--quick] [--staged]',
  '                 [--shard-count <n> --shard-index <i>] [--defer-exit] [--no-cache]',
  '                 [--accept-policy-change=<digest>] [--help] [--version]',
  '       nitpicker init [--agents-md] [--ci github] [--help]',
  '       nitpicker aggregate --input-root <dir> --shard-count <n> [--output <dir>] [--policy-root <dir>] [--details]',
  '       nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>] [--help]',
  '       nitpicker changelog [<version>]',
  '       nitpicker base [--base <ref>]',
  '       nitpicker show [--all] [--rule <substring>]... [--path <path>] [--details] [--output <dir>]',
  '       nitpicker explain <tool/rule>...',
  '       nitpicker rules [--preset <name>] [--tool <name>]',
  '',
  'Commands (nitpicker <command> --help lists its options):',
  '  nitpicker                Compare your changes with the merge base and fail on the problems they add.',
  '  nitpicker init           Detect the project and set it up: config, install command, agent skill.',
  '  nitpicker aggregate      Combine the reports of sharded runs into one result.',
  '  nitpicker cache publish  Upload the findings of HEAD to the remote cache.',
  '  nitpicker changelog      Print what changed in a version, from the changelog of the package.',
  '  nitpicker base           Print the base ref a run would compare with.',
  '  nitpicker show           Print the summary of the last run again, filtered, without running anything.',
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
  '  --json                           Print one compact JSON result on stdout instead of the summary.',
  '  --quick                          Run only the fast checks and skip the tests and what builds on them.',
  '  --staged                         Judge the git index (what the next commit would contain), not the working tree.',
  '  --output <dir>                   Write the reports to this directory.',
  '  --shard-count <n>                Split the analyzers over n jobs (with --shard-index).',
  '  --shard-index <i>                Run shard i of the split (0 to n-1).',
  '  --defer-exit                     Exit 0 after writing the reports; for shard jobs before aggregate.',
  '  --no-cache                       Do not read or write the findings cache.',
  '  --accept-policy-change=<digest>  Accept a reviewed loosening of the config (people only).',
  '  --help                           Print this help.',
  '  --version                        Print the installed nitpicker version.',
  '',
];

function exampleLines(analyzer) {
  const rows = [
    ['nitpicker', 'check your change against the detected base'],
    ['nitpicker --base origin/release', 'check it against a given base'],
    ['nitpicker --fix', 'apply the fixes nitpicker knows, then check'],
    [`nitpicker --analyzer ${analyzer}`, 'iterate on one analyzer; finish with a plain nitpicker'],
    ['nitpicker src/orders/order.ts', 'gate your change to one file'],
    ['nitpicker --all src/orders', 'show every finding in one folder'],
  ];
  const width = Math.max(...rows.map(([command]) => command.length));
  return rows.map(([command, text]) => `  ${command.padEnd(width)}  ${text}`);
}

function expectedUsage(analyzerLines, analyzer) {
  return [
    ...EXPECTED_USAGE_HEAD,
    ...analyzerLines,
    '',
    'Exit codes: 0 pass; 1 new findings or failing tests; 2 tool error or invalid input (not a pass).',
    'Reports: reports/quality/diff/ (--all: reports/quality/snapshot/, or --output <dir>). Read',
    'new-findings.json (--all: findings.json) first, then report.txt. nitpicker show prints the last',
    'run again, filtered by --rule or --path, without running it.',
    '',
    'Examples:',
    ...exampleLines(analyzer),
    'Paths limit the findings shown and gate the run; the analysis still covers the whole project.',
    '',
    `Start a new project with nitpicker init. Reference: ${USAGE_LINK}`,
    '',
  ].join('\n');
}

const TYPESCRIPT_ANALYZERS = [
  'Analyzers of the typescript preset (for --analyzer):',
  '  eslint-lint, eslint-errors, eslint-logging, eslint-module-effects, entry-points, prettier-format,',
  '  typescript-typecheck, dependency-architecture, coding-standards, coupling, test-runtime,',
  '  structure, duplicates, dead-code, coverage, test-console, crap, mutation, repository-hygiene',
];
const EXPECTED_USAGE = expectedUsage(TYPESCRIPT_ANALYZERS, 'eslint-lint');
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

function runIn(currentProjectRoot, ...cliArguments) {
  return runWith({ currentProjectRoot }, ...cliArguments);
}

function runWith(cli, ...cliArguments) {
  let stdoutText = '';
  let stderrText = '';
  const exitCode = runCli({
    ...cli,
    arguments_: cliArguments,
    stdout: { write: (text) => (stdoutText += text) },
    stderr: { write: (text) => (stderrText += text) },
  });
  return { exitCode, stdoutText, stderrText };
}

function parseError(text) {
  try {
    JSON.parse(text);
  } catch (error) {
    return error.message;
  }
  throw new Error(`${text} parsed`);
}

function projectWith(config, projectFiles = {}) {
  const root = temporaryRoot('nitpicker-help-');
  writeFiles(root, {
    ...projectFiles,
    ...(config === undefined ? {} : { 'nitpicker.config.json': config }),
  });
  return root;
}

function run(...cliArguments) {
  return runIn(projectWith(), ...cliArguments);
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
  it('prints the usage, commands, flags, analyzers, exit codes, reports and examples, and exits 0', () => {
    expect(run('--help')).toEqual({ exitCode: 0, stdoutText: EXPECTED_USAGE, stderrText: '' });
  });

  it.each([
    [],
    ['init'],
    ['aggregate'],
    ['cache', 'publish'],
    ['base'],
    ['show'],
    ['explain'],
    ['rules'],
  ])('takes -h as --help after %j', (...command) => {
    const help = run(...command, '--help');

    expect(run(...command, '-h')).toEqual(help);
    expect(help.exitCode).toBe(0);
  });

  it('lists the analyzers of the preset the config names, and uses one in the example', () => {
    const root = projectWith('{ "preset": "java" }', { 'pom.xml': '<project/>\n' });
    const java = ['Analyzers of the java preset (for --analyzer):', '  java, repository-hygiene'];

    expect(runIn(root, '--help').stdoutText).toBe(expectedUsage(java, 'java'));
  });

  it('leaves out disabled analyzers and lists custom ones', () => {
    const root = projectWith(
      JSON.stringify({
        preset: 'go',
        disable: ['repository-hygiene'],
        analyzers: [{ name: 'house-rules', command: './scripts/house-rules' }],
      }),
      { 'go.mod': 'module example.com/help\n' },
    );
    const go = ['Analyzers of the go preset (for --analyzer):', '  go, mutation, house-rules'];

    expect(runIn(root, '--help').stdoutText).toBe(expectedUsage(go, 'go'));
  });

  it('lists the analyzers of the project a run would check, not of a config further up', () => {
    const { root } = createGitRepository({
      'nitpicker.config.json': '{ "preset": "go" }',
      'go.mod': 'module example.com/help\n',
      'packages/app/package.json': '{}',
    });
    const go = [
      'Analyzers of the go preset (for --analyzer):',
      '  go, mutation, repository-hygiene',
    ];

    expect({
      top: runIn(root, '--help').stdoutText,
      app: runIn(path.join(root, 'packages/app'), '--help').stdoutText,
      byPath: runWith({ workingDirectory: root }, 'packages/app', '--help').stdoutText,
    }).toEqual({ top: expectedUsage(go, 'go'), app: EXPECTED_USAGE, byPath: EXPECTED_USAGE });
  });

  it('still prints the help when the config cannot be read, and says why the analyzers are missing', () => {
    const root = projectWith('{ "preset": ');
    const { exitCode, stdoutText } = runIn(root, '--help');

    const reason = parseError('{ "preset": ');

    expect({ exitCode, stdoutText }).toEqual({
      exitCode: 0,
      stdoutText: expectedUsage(
        [`Analyzers: not listed (nitpicker.config.json is not valid JSON: ${reason})`],
        '<name>',
      ),
    });
  });

  it('links the usage page of the checkout it runs from', () => {
    expect(USAGE_LINK).toBe('https://github.com/jhonDoe15/nitpicker/blob/main/docs/usage.md');
  });

  it('lists every command with its description', () => {
    expect(COMMANDS.map(([name]) => name)).toEqual([
      'nitpicker',
      'nitpicker init',
      'nitpicker aggregate',
      'nitpicker cache publish',
      'nitpicker changelog',
      'nitpicker base',
      'nitpicker show',
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
    expect(run('-h', '--version').stdoutText).toBe(EXPECTED_USAGE);
  });
});
