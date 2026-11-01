const DOCUMENTATION_URL = 'https://github.com/jhonDoe15/nitpicker/blob/main/docs/usage.md';
const HELP_ROW = ['--help', 'Print this help.'];

export const COMMANDS = [
  ['nitpicker', 'Compare your changes with the merge base and fail on the problems they add.'],
  ['nitpicker init', 'Detect the project and set it up: config, install command, agent skill.'],
  ['nitpicker aggregate', 'Combine the reports of sharded runs into one result.'],
  ['nitpicker cache publish', 'Upload the findings of HEAD to the remote cache.'],
  ['nitpicker base', 'Print the base ref a run would compare with.'],
  ['nitpicker explain', 'Print what the rule reference says about the rules named.'],
  ['nitpicker rules', 'List the rules the preset of the project reports.'],
];

export const FLAGS = [
  ['--all', 'Report every finding in the checkout, with no baseline.'],
  ['--base <ref>', 'Compare against this ref instead of the detected base.'],
  ['--fix', 'Apply ESLint and Prettier fixes to the changed files, then compare.'],
  ['--analyzer <name>', 'Run only this analyzer (repeatable).'],
  ['--rule <substring>', 'List the findings whose rule matches (repeatable).'],
  ['--details', 'Print every new and held finding with its full message.'],
  ['--output <dir>', 'Write the reports to this directory.'],
  ['--shard-count <n>', 'Split the analyzers over n jobs (with --shard-index).'],
  ['--shard-index <i>', 'Run shard i of the split (0 to n-1).'],
  ['--defer-exit', 'Exit 0 after writing the reports; for shard jobs before aggregate.'],
  ['--no-cache', 'Do not read or write the findings cache.'],
  ['--accept-policy-change=<digest>', 'Accept a reviewed loosening of the config (people only).'],
  HELP_ROW,
  ['--version', 'Print the installed nitpicker version.'],
];

export const INIT_FLAGS = [
  [
    '--agents-md',
    'Append the agent guidance snippet to AGENTS.md (CLAUDE.md if only that exists).',
  ],
  ['--ci github', 'Write a GitHub Actions workflow that runs nitpicker on pull requests.'],
  HELP_ROW,
];

export const AGGREGATE_FLAGS = [
  ['--input-root <dir>', 'Read the shard reports from <dir>/0 to <dir>/n-1.'],
  ['--shard-count <n>', 'The number of shards the run was split into.'],
  ['--output <dir>', 'Write the combined reports here (default reports/quality/diff/combined).'],
  ['--policy-root <dir>', 'Read the analyzer configuration from this folder, not the head commit.'],
  ['--details', 'Print every new and held finding with its full message.'],
  HELP_ROW,
];

export const CACHE_PUBLISH_FLAGS = [
  ['--analyzer <name>', 'Publish only this analyzer (repeatable).'],
  ['--shard-count <n>', 'Split the analyzers over n jobs (with --shard-index).'],
  ['--shard-index <i>', 'Publish shard i of the split (0 to n-1).'],
  HELP_ROW,
];

const INIT_USAGE = 'nitpicker init [--agents-md] [--ci github] [--help]';
const AGGREGATE_USAGE =
  'nitpicker aggregate --input-root <dir> --shard-count <n> [--output <dir>] [--policy-root <dir>]' +
  ' [--details]';
const CACHE_PUBLISH_USAGE =
  'nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>] [--help]';
const USAGE_LINES = [
  'nitpicker [--base <ref>] [--output <dir>] [--all | --fix] [--analyzer <name>]...',
  '          [--rule <substring>]... [--details] [--shard-count <n> --shard-index <i>]',
  '          [--defer-exit] [--no-cache] [--accept-policy-change=<digest>] [--help] [--version]',
  INIT_USAGE,
  AGGREGATE_USAGE,
  CACHE_PUBLISH_USAGE,
  'nitpicker base [--base <ref>]',
  'nitpicker explain <tool/rule>...',
  'nitpicker rules [--preset <name>] [--tool <name>]',
];

function table(rows) {
  const width = Math.max(...rows.map(([name]) => name.length));
  return rows.map(([name, text]) => `  ${name.padEnd(width)}  ${text}\n`).join('');
}

function usageBlock() {
  const [first, ...rest] = USAGE_LINES;
  return [`Usage: ${first}`, ...rest.map((line) => `       ${line}`)].join('\n');
}

export const USAGE_TEXT =
  `${usageBlock()}\n\nCommands:\n${table(COMMANDS)}\nOptions:\n${table(FLAGS)}\n` +
  `Options of nitpicker init:\n${table(INIT_FLAGS)}\n` +
  `Options of nitpicker aggregate:\n${table(AGGREGATE_FLAGS)}\n` +
  `Options of nitpicker cache publish:\n${table(CACHE_PUBLISH_FLAGS)}\n` +
  `Start a new project with nitpicker init. Reference: ${DOCUMENTATION_URL}\n`;

export const INIT_USAGE_TEXT =
  `Usage: ${INIT_USAGE}\n\n` +
  'Detects the language, build tool, test runner and package manager, writes a minimal\n' +
  'nitpicker.config.json, and prints the missing peers, the agent skill to install and the\n' +
  'command to run. It never overwrites a file: when an existing file needs a change, it prints\n' +
  'the diff and exits 1. It exits 0 when everything is set up, and 2 when it cannot run (no\n' +
  'project, no Git repository, Node.js older than the package needs, a folder, file or link in\n' +
  'the way of a file it writes, or an unknown argument).\n\n' +
  `Options:\n${table(INIT_FLAGS)}`;

export const AGGREGATE_USAGE_TEXT =
  `Usage: ${AGGREGATE_USAGE}\n\n` +
  'Combines the reports of the shard jobs (run with --shard-count, --shard-index and --defer-exit)\n' +
  'into one result, with the exit codes of a normal run.\n\n' +
  `Options:\n${table(AGGREGATE_FLAGS)}`;

export const CACHE_PUBLISH_USAGE_TEXT =
  `Usage: ${CACHE_PUBLISH_USAGE}\n\n` +
  'Analyzes the committed HEAD tree and uploads its findings to the remote cache\n' +
  '(NITPICKER_CACHE_URL), so later branches reuse them as their base.\n\n' +
  `Options:\n${table(CACHE_PUBLISH_FLAGS)}`;
