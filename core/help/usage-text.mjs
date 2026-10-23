const DOCUMENTATION_URL = 'https://github.com/jhonDoe15/nitpicker/blob/main/docs/usage.md';

export const COMMANDS = [
  ['nitpicker', 'Compare your changes with the merge base and fail on the problems they add.'],
  ['nitpicker init', 'Detect the project and set it up: config, install command, agent skill.'],
  ['nitpicker aggregate', 'Combine the reports of sharded runs into one result.'],
  ['nitpicker cache publish', 'Upload the findings of HEAD to the remote cache.'],
];

export const FLAGS = [
  ['--all', 'Report every finding in the checkout, with no baseline.'],
  ['--base <ref>', 'Compare against this ref instead of the detected base.'],
  ['--fix', 'Apply ESLint and Prettier fixes to the changed files, then compare.'],
  ['--analyzer <name>', 'Run only this analyzer (repeatable).'],
  ['--rule <substring>', 'List the findings whose rule matches (repeatable).'],
  ['--output <dir>', 'Write the reports to this directory.'],
  ['--shard-count <n>', 'Split the analyzers over n jobs (with --shard-index).'],
  ['--shard-index <i>', 'Run shard i of the split (0 to n-1).'],
  ['--defer-exit', 'Exit 0 after writing the reports; for shard jobs before aggregate.'],
  ['--no-cache', 'Do not read or write the findings cache.'],
  ['--accept-policy-change=<digest>', 'Accept a reviewed loosening of the config (people only).'],
  ['--help', 'Print this help.'],
  ['--version', 'Print the installed nitpicker version.'],
];

export const INIT_FLAGS = [
  [
    '--agents-md',
    'Append the agent guidance snippet to AGENTS.md (CLAUDE.md if only that exists).',
  ],
  ['--ci github', 'Write .github/workflows/nitpicker.yml.'],
  ['--help', 'Print this help.'],
];

const USAGE_LINES = [
  'nitpicker [--base <ref>] [--output <dir>] [--all | --fix] [--analyzer <name>]...',
  '          [--rule <substring>]... [--shard-count <n> --shard-index <i>] [--defer-exit]',
  '          [--no-cache] [--accept-policy-change=<digest>] [--help] [--version]',
  'nitpicker init [--agents-md] [--ci github] [--help]',
  'nitpicker aggregate --input-root <dir> --shard-count <n> [--output <dir>] [--policy-root <dir>]',
  'nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>]',
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
  `Start a new project with nitpicker init. Reference: ${DOCUMENTATION_URL}\n`;

export const INIT_USAGE_TEXT =
  'Usage: nitpicker init [--agents-md] [--ci github] [--help]\n\n' +
  'Detects the language, build tool, test runner and package manager, writes a minimal\n' +
  'nitpicker.config.json, and prints the missing peers, the agent skill to install and the\n' +
  'command to run. It never overwrites a file: for an existing file it prints a diff and exits 1.\n\n' +
  `Options:\n${table(INIT_FLAGS)}`;
