import { textOf } from '../../shared/values/readers.mts';

type Row = readonly [name: string, text: string];

type AnalyzerListing =
  { readonly preset: string; readonly names: readonly string[] } | { readonly error: string };

const WRAP_WIDTH = 100;
const LIST_INDENT = '  ';
const HELP_ROW: Row = ['--help', 'Print this help.'];

export const COMMANDS: readonly Row[] = [
  ['nitpicker', 'Compare your changes with the merge base and fail on the problems they add.'],
  ['nitpicker init', 'Detect the project and set it up: config, install command, agent skill.'],
  ['nitpicker aggregate', 'Combine the reports of sharded runs into one result.'],
  ['nitpicker cache publish', 'Upload the findings of HEAD to the remote cache.'],
  ['nitpicker changelog', 'Print what changed in a version, from the changelog of the package.'],
  ['nitpicker base', 'Print the base ref a run would compare with.'],
  ['nitpicker explain', 'Print what the rule reference says about the rules named.'],
  ['nitpicker rules', 'List the rules the preset of the project reports.'],
];

export const FLAGS: readonly Row[] = [
  ['--all', 'Report every finding in the checkout, with no baseline.'],
  ['--base <ref>', 'Compare against this ref instead of the detected base.'],
  ['--fix', 'Apply the fixers of the preset to the changed files, then compare.'],
  [
    '--dry-run',
    'With --fix: write fix.patch and fixes.json to the output folder and change no file.',
  ],
  ['--analyzer <name>', 'Run only this analyzer (repeatable).'],
  [
    '--rule <substring>',
    'List the findings whose rule matches; with --fix, apply only the fixes of tool/rule (repeatable).',
  ],
  ['--details', 'Print every new and held finding with its full message.'],
  ['--json', 'Print one compact JSON result on stdout instead of the summary.'],
  ['--quick', 'Run only the fast checks and skip the tests and what builds on them.'],
  ['--staged', 'Judge the git index (what the next commit would contain), not the working tree.'],
  ['--output <dir>', 'Write the reports to this directory.'],
  ['--shard-count <n>', 'Split the analyzers over n jobs (with --shard-index).'],
  ['--shard-index <i>', 'Run shard i of the split (0 to n-1).'],
  ['--defer-exit', 'Exit 0 after writing the reports; for shard jobs before aggregate.'],
  ['--no-cache', 'Do not read or write the findings cache.'],
  ['--accept-policy-change=<digest>', 'Accept a reviewed loosening of the config (people only).'],
  HELP_ROW,
  ['--version', 'Print the installed nitpicker version.'],
];

export const INIT_FLAGS: readonly Row[] = [
  [
    '--agents-md',
    'Append the agent guidance snippet to AGENTS.md (CLAUDE.md if only that exists).',
  ],
  ['--ci github', 'Write a GitHub Actions workflow that runs nitpicker on pull requests.'],
  HELP_ROW,
];

export const AGGREGATE_FLAGS: readonly Row[] = [
  ['--input-root <dir>', 'Read the shard reports from <dir>/0 to <dir>/n-1.'],
  ['--shard-count <n>', 'The number of shards the run was split into.'],
  ['--output <dir>', 'Write the combined reports here (default reports/quality/diff/combined).'],
  ['--policy-root <dir>', 'Read the analyzer configuration from this folder, not the head commit.'],
  ['--details', 'Print every new and held finding with its full message.'],
  HELP_ROW,
];

export const CACHE_PUBLISH_FLAGS: readonly Row[] = [
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
const USAGE_LINES: readonly [string, ...string[]] = [
  'nitpicker [<path>...] [--base <ref>] [--output <dir>] [--all | --fix [--dry-run]] [--analyzer <name>]...',
  '          [--rule <substring>]... [--details] [--json] [--quick] [--staged]',
  '          [--shard-count <n> --shard-index <i>] [--defer-exit] [--no-cache]',
  '          [--accept-policy-change=<digest>] [--help] [--version]',
  INIT_USAGE,
  AGGREGATE_USAGE,
  CACHE_PUBLISH_USAGE,
  'nitpicker changelog [<version>]',
  'nitpicker base [--base <ref>]',
  'nitpicker explain <tool/rule>...',
  'nitpicker rules [--preset <name>] [--tool <name>] [--fixable]',
];

function table(rows: readonly Row[]): string {
  const width = Math.max(...rows.map(([name]) => name.length));
  return rows.map(([name, text]) => `  ${name.padEnd(width)}  ${text}\n`).join('');
}

function usageBlock(): string {
  const [first, ...rest] = USAGE_LINES;
  return [`Usage: ${first}`, ...rest.map((line) => `       ${line}`)].join('\n');
}

function wrappedList(names: readonly string[]): string {
  const lines: string[] = [];
  for (const [index, name] of names.entries()) {
    const item = index === names.length - 1 ? name : `${name},`;
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${item}`.length <= WRAP_WIDTH) {
      lines[lines.length - 1] = `${last} ${item}`;
    } else {
      lines.push(`${LIST_INDENT}${item}`);
    }
  }
  return lines.map((line) => `${line}\n`).join('');
}

function analyzerBlock(analyzers: AnalyzerListing): string {
  return 'error' in analyzers
    ? `Analyzers: not listed (${analyzers.error})\n`
    : `Analyzers of the ${analyzers.preset} preset (for --analyzer):\n${wrappedList(analyzers.names)}`;
}

function examples(analyzers: AnalyzerListing): string {
  const analyzer = ('names' in analyzers ? analyzers.names[0] : undefined) ?? '<name>';
  return table([
    ['nitpicker', 'check your change against the detected base'],
    ['nitpicker --base origin/release', 'check it against a given base'],
    ['nitpicker --fix', 'apply the fixes nitpicker knows, then check'],
    [`nitpicker --analyzer ${analyzer}`, 'iterate on one analyzer; finish with a plain nitpicker'],
    ['nitpicker src/orders/order.ts', 'gate your change to one file'],
    ['nitpicker --all src/orders', 'show every finding in one folder'],
  ]);
}

export function usageText({
  analyzers,
  referenceUrl,
}: {
  readonly analyzers: AnalyzerListing;
  readonly referenceUrl?: unknown;
}): string {
  const reference = referenceUrl === undefined ? '' : ` Reference: ${textOf(referenceUrl)}`;
  return (
    `${usageBlock()}\n\nCommands (nitpicker <command> --help lists its options):\n${table(COMMANDS)}\n` +
    `Options:\n${table(FLAGS)}\n${analyzerBlock(analyzers)}\n` +
    'Exit codes: 0 pass; 1 new findings or failing tests; 2 tool error or invalid input (not a pass).\n' +
    'Reports: reports/quality/diff/ (--all: reports/quality/snapshot/, or --output <dir>). Read\n' +
    'new-findings.json (--all: findings.json) first, then report.txt.\n\n' +
    `Examples:\n${examples(analyzers)}` +
    'Paths limit the findings shown and gate the run; the analysis still covers the whole project.\n\n' +
    `Start a new project with nitpicker init.${reference}\n`
  );
}

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
