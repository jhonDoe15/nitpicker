const RECORD = '\u001E';
const FIELD = '\u001F';
export const LOG_FORMAT = '%x1E%H%x1F%s%x1F%b%x1F';

const MERGE_SUBJECT = /^Merge pull request #(\d+) from (\S+)/u;
const SQUASH_SUBJECT = /^(.+) \(#(\d+)\)$/u;
const VERSION = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u;
const RELEASE_HEADING = /^## \[([^\]]+)\]/u;
const LINK_DEFINITION = /^\[[^\]]+\]: /u;
const UNRELEASED_LINK = /^\[Unreleased\]: (\S+)\/compare\/\S+$/u;
const SUBSECTION = /^### (.+)$/u;
const REFERENCE = /#(\d+)/gu;
const ADDED = /^(?:add|adds|added|support|introduce|new)\b/iu;
const FIXED = /^(?:fix|fixes|fixed)\b/iu;
const SECTION_ORDER = ['Added', 'Changed', 'Fixed', 'Upgrade notes'];

const SHIPPED = [
  /^(?:core|shared|languages|skills)\//u,
  /^spec\/[^/]+\.schema\.json$/u,
  /^docs\/agents-snippet\.md$/u,
  /^(?:package\.json|Dockerfile|action\.yml|\.pre-commit-hooks\.yaml)$/u,
];
const NOT_SHIPPED = [
  /\.test\.[cm]?[jt]s$/u,
  /_test\.go$/u,
  /(?:^|\/)(?:__tests__|test-support|fixtures)\//u,
  /(?:^|\/)README\.md$/u,
];

export type MergedPullRequest = {
  readonly number: number;
  readonly title: string;
  readonly files: readonly string[];
};

export type Release = {
  readonly version: string;
  readonly date: string;
  readonly pullRequests: readonly MergedPullRequest[];
};

type Subsection = { readonly heading: string; readonly lines: readonly string[] };

function pullRequestOf(
  subject: string,
  body: string,
): { readonly number: number; readonly title: string } | undefined {
  const merge = MERGE_SUBJECT.exec(subject);
  if (merge) {
    const title = body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '');
    return { number: Number(merge[1]), title: title ?? merge[2] ?? '' };
  }
  const squash = SQUASH_SUBJECT.exec(subject);
  return squash ? { number: Number(squash[2]), title: squash[1] ?? '' } : undefined;
}

export function parseMergeLog(log: string): MergedPullRequest[] {
  return log.split(RECORD).flatMap((record) => {
    const [, subject = '', body = '', names = ''] = record.split(FIELD);
    const pullRequest = pullRequestOf(subject.trim(), body);
    if (pullRequest === undefined) {
      return [];
    }
    const files = names
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name !== '');
    return [{ ...pullRequest, files }];
  });
}

export function shipsFile(file: string): boolean {
  return (
    SHIPPED.some((pattern) => pattern.test(file)) &&
    !NOT_SHIPPED.some((pattern) => pattern.test(file))
  );
}

export function shipsChange(pullRequest: MergedPullRequest): boolean {
  return pullRequest.files.some((file) => shipsFile(file));
}

export function sectionOf(title: string): string {
  if (FIXED.test(title)) {
    return 'Fixed';
  }
  return ADDED.test(title) ? 'Added' : 'Changed';
}

export function releaseVersion(input: string): string {
  const match = VERSION.exec(input);
  if (match?.[1] === undefined) {
    throw new Error(`Not a version: ${input}. Pass one such as 0.2.0 or 0.2.0-rc.1.`);
  }
  return match[1];
}

function changelogVersions(text: string): string[] {
  return text.split(/\r?\n/u).flatMap((line) => RELEASE_HEADING.exec(line)?.[1] ?? []);
}

export function latestRelease(text: string): string {
  const latest = changelogVersions(text).find((version) => version !== 'Unreleased');
  if (latest === undefined) {
    throw new Error('CHANGELOG.md lists no release yet; pass --since with the first commit.');
  }
  return latest;
}

function trimBlankLines(lines: readonly string[]): string[] {
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first === -1) {
    return [];
  }
  const last = lines.findLastIndex((line) => line.trim() !== '');
  return lines.slice(first, last + 1);
}

function subsections(lines: readonly string[]): Subsection[] {
  const found: { heading: string; lines: string[] }[] = [];
  for (const line of lines) {
    const heading = SUBSECTION.exec(line)?.[1];
    if (heading !== undefined || found.length === 0) {
      found.push({ heading: heading ?? 'Changed', lines: [] });
    }
    if (heading === undefined) {
      found.at(-1)?.lines.push(line);
    }
  }
  return found.map(({ heading, lines: body }) => ({ heading, lines: trimBlankLines(body) }));
}

function mentions(lines: readonly string[], number: number): boolean {
  return lines.some((line) =>
    [...line.matchAll(REFERENCE)].some((match) => Number(match[1]) === number),
  );
}

export function draftEntries(
  written: readonly string[],
  pullRequests: readonly MergedPullRequest[],
): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  for (const { heading, lines } of subsections(written)) {
    sections.set(heading, [...(sections.get(heading) ?? []), ...lines]);
  }
  for (const pullRequest of pullRequests) {
    if (shipsChange(pullRequest) && !mentions(written, pullRequest.number)) {
      const heading = sectionOf(pullRequest.title);
      const entry = `- ${pullRequest.title} (#${String(pullRequest.number)})`;
      sections.set(heading, [...(sections.get(heading) ?? []), entry]);
    }
  }
  return sections;
}

function renderSections(sections: ReadonlyMap<string, readonly string[]>): string[] {
  const headings = [
    ...SECTION_ORDER.filter((heading) => sections.has(heading)),
    ...[...sections.keys()].filter((heading) => !SECTION_ORDER.includes(heading)),
  ];
  return headings
    .filter((heading) => (sections.get(heading) ?? []).length > 0)
    .flatMap((heading) => [`### ${heading}`, '', ...(sections.get(heading) ?? []), '']);
}

function linkDefinitions(lines: readonly string[], version: string): string[] {
  const unreleased = lines.findIndex((line) => UNRELEASED_LINK.test(line));
  const repository = UNRELEASED_LINK.exec(lines[unreleased] ?? '')?.[1];
  if (repository === undefined) {
    throw new Error('CHANGELOG.md has no [Unreleased] link definition to a compare URL.');
  }
  return [
    ...lines.slice(0, unreleased),
    `[Unreleased]: ${repository}/compare/v${version}...HEAD`,
    `[${version}]: ${repository}/releases/tag/v${version}`,
    ...lines.slice(unreleased + 1),
  ];
}

export function releaseChangelog(text: string, release: Release): string {
  const lines = text.split(/\r?\n/u);
  if (changelogVersions(text).includes(release.version)) {
    throw new Error(`CHANGELOG.md already has an entry for ${release.version}.`);
  }
  const start = lines.indexOf('## [Unreleased]');
  if (start === -1) {
    throw new Error('CHANGELOG.md has no "## [Unreleased]" heading.');
  }
  const following = lines.slice(start + 1);
  const length = following.findIndex(
    (line) => RELEASE_HEADING.test(line) || LINK_DEFINITION.test(line),
  );
  const end = start + 1 + (length === -1 ? following.length : length);
  const body = renderSections(draftEntries(lines.slice(start + 1, end), release.pullRequests));
  if (body.length === 0) {
    throw new Error('Nothing to release: no shipped change was merged and Unreleased is empty.');
  }
  return [
    ...lines.slice(0, start + 1),
    '',
    `## [${release.version}] - ${release.date}`,
    '',
    ...body,
    ...linkDefinitions(lines.slice(end), release.version),
  ].join('\n');
}
