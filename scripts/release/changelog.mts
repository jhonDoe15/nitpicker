import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  LOG_FORMAT,
  type MergedPullRequest,
  latestRelease,
  parseMergeLog,
  releaseChangelog,
  releaseVersion,
  shipsChange,
} from './changelog-draft.mts';

const USAGE =
  'Usage: node scripts/release/changelog.mts <version> [--since <ref>] [--until <ref>] [--date <YYYY-MM-DD>]';
const GIT_OUTPUT_LIMIT = 256 * 1024 * 1024;
const GIT_TIMEOUT_MS = 120_000;

export type ChangelogOptions = {
  readonly root: string;
  readonly version: string;
  readonly since?: string | undefined;
  readonly until?: string | undefined;
  readonly date?: string | undefined;
};

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_LIMIT,
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function requireCommit(root: string, reference: string): void {
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `${reference}^{commit}`]);
  } catch (error) {
    throw new Error(
      `${reference} is not a commit here. Fetch the tags and enough history ` +
        '(git fetch --depth=2000 origin main --tags), or pass --since with the last released commit.',
      { cause: error },
    );
  }
}

function mergedPullRequests(root: string, since: string, until: string): MergedPullRequest[] {
  requireCommit(root, since);
  requireCommit(root, until);
  const log = git(root, [
    'log',
    '--first-parent',
    '--diff-merges=first-parent',
    '--name-only',
    `--format=${LOG_FORMAT}`,
    `${since}..${until}`,
  ]);
  return parseMergeLog(log).toReversed();
}

function listed(pullRequests: readonly MergedPullRequest[]): string[] {
  return pullRequests.map(({ number, title }) => `  #${String(number)} ${title}`);
}

export function writeReleaseChangelog(options: ChangelogOptions): string {
  const file = path.join(options.root, 'CHANGELOG.md');
  const text = readFileSync(file, 'utf8');
  const version = releaseVersion(options.version);
  const since = options.since ?? `v${latestRelease(text)}`;
  const pullRequests = mergedPullRequests(options.root, since, options.until ?? 'HEAD');
  const date = options.date ?? new Date().toISOString().slice(0, 'YYYY-MM-DD'.length);
  writeFileSync(file, releaseChangelog(text, { version, date, pullRequests }));
  const left = pullRequests.filter((pullRequest) => !shipsChange(pullRequest));
  return [
    `CHANGELOG.md: ${version} drafted from ${String(pullRequests.length)} pull requests merged since ${since}.`,
    `Left out, no shipped file changed (${String(left.length)}):`,
    ...listed(left),
    'Rewrite each drafted entry for users and drop internal ones before you commit.',
  ].join('\n');
}

function main(args: readonly string[]): void {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      since: { type: 'string' },
      until: { type: 'string' },
      date: { type: 'string' },
    },
  });
  const [version] = positionals;
  if (version === undefined || positionals.length > 1) {
    throw new Error(USAGE);
  }
  const root = path.resolve(import.meta.dirname, '../..');
  process.stdout.write(`${writeReleaseChangelog({ root, version, ...values })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
