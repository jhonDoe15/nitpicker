import { failingHeadTests } from '../failing-tests/failing-tests.mts';
import { escapeRegExp as untypedEscape } from '../../../../shared/paths/glob.mjs';
import {
  toolErrorHelpLine,
  troubleshootingLinkOf,
} from '../../../../shared/messages/troubleshooting.mjs';
import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
} from '../../../../shared/rules/finding-helpers.mjs';
import { singleLine } from '../format/text.mjs';
import { ANSI, pluralize, style } from './style.mts';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { textOf } from '../../../../shared/values/readers.mts';

export { ANSI, pluralize, style };

type ErrorGroup = {
  readonly first: ReportEntry;
  readonly members: ReportEntry[];
  readonly skipped: Set<string>;
};

type SummaryOptions = { readonly color: boolean; readonly projectRoot?: string | undefined };

const oneLine: (value: unknown) => string = singleLine;
const helpLineOf: (messages: readonly unknown[]) => string | undefined = toolErrorHelpLine;
const linkOf: (message: string) => string | undefined = troubleshootingLinkOf;
const escapeRegExp: (text: string) => string = untypedEscape;
const testsFailedRule: unknown = TESTS_FAILED_RULE;
const testsSkippedRule: unknown = TESTS_FAILED_SKIPPED_RULE;

const ERROR_HEADLINE_LIMIT = 300;
const ERROR_LINE_PATTERN = /error TS\d+|Error:|ERR_|Cannot find|not found|ENOENT/u;
const DEPENDENCY_SKIP = /^(?<skipped>\S+) skipped: (?<cause>\S+) failed \(see above\)$/u;
const LISTED_NAMES = 3;
const SNAPSHOT_ORDER = ['base', 'head'];

export function splitToolErrors(toolErrors: readonly ReportEntry[]): {
  readonly failingTests: ReportEntry[];
  readonly otherErrors: ReportEntry[];
} {
  const failingTests = failingHeadTests(toolErrors);
  return {
    failingTests,
    otherErrors: withoutSkipNotices(toolErrors).filter((error) => !failingTests.includes(error)),
  };
}

export function withoutSkipNotices<T extends ReportEntry>(toolErrors: readonly T[]): T[] {
  const listedSnapshots = new Set(
    toolErrors.filter(({ rule }) => rule === testsFailedRule).map(({ snapshot }) => snapshot),
  );
  return toolErrors.filter(
    ({ rule, snapshot }) => rule !== testsSkippedRule || !listedSnapshots.has(snapshot),
  );
}

export function errorHeadline(message: unknown): string {
  const link = linkOf(String(message));
  const text = oneLine(String(message).replace(link ?? '', ''));
  const start = Math.max(text.search(ERROR_LINE_PATTERN), 0);
  const headline = text.slice(start, start + ERROR_HEADLINE_LIMIT).trimEnd();
  const shown =
    headline.length < text.length - start
      ? `${headline}… (full text in the diagnostics file)`
      : headline;
  return link === undefined ? shown : `${shown} ${link}`;
}

function relativeToRoot(text: string, projectRoot: string | undefined): string {
  const root = projectRoot?.replace(/[\\/]+$/u, '');
  if (root === undefined || root === '') {
    return text;
  }
  return text.replaceAll(
    new RegExp(`(?<![\\w.\\-/])${escapeRegExp(root)}(?![\\w-]|\\.\\w)`, 'gu'),
    '.',
  );
}

function listNames(names: readonly string[]): string {
  if (names.length <= LISTED_NAMES) {
    return names.length < 2
      ? names.join('')
      : `${names.slice(0, -1).join(', ')} and ${String(names.at(-1))}`;
  }
  return `${names.slice(0, 2).join(', ')} and ${String(names.length - 2)} more`;
}

function snapshotSuffix(snapshots: readonly string[]): string {
  return snapshots.length === 0 ? '' : ` (${snapshots.join(' and ')})`;
}

function orderedSnapshots(snapshots: ReadonlySet<string>): string[] {
  const known = SNAPSHOT_ORDER.filter((name) => snapshots.has(name));
  const others = [...snapshots]
    .filter((name) => !SNAPSHOT_ORDER.includes(name))
    .toSorted((left, right) => left.localeCompare(right));
  return [...known, ...others];
}

function groupLabel(members: readonly ReportEntry[]): string {
  const byTool = new Map<string, Set<string>>();
  for (const { tool, snapshot } of members) {
    const snapshots = byTool.get(textOf(tool)) ?? new Set<string>();
    if (snapshot !== undefined) {
      snapshots.add(textOf(snapshot));
    }
    byTool.set(textOf(tool), snapshots);
  }
  const entries = [...byTool].map(([tool, snapshots]) => ({
    tool,
    snapshots: orderedSnapshots(snapshots),
  }));
  const spans = new Set(entries.map(({ snapshots }) => snapshots.join(' and ')));
  if (spans.size === 1) {
    const names = listNames(entries.map(({ tool }) => tool));
    return `${names}${snapshotSuffix(entries[0]?.snapshots ?? [])}`;
  }
  return listNames(entries.map(({ tool, snapshots }) => `${tool}${snapshotSuffix(snapshots)}`));
}

function keyOf({ tool, snapshot }: ReportEntry): string {
  return `${textOf(tool)}\0${String(snapshot)}`;
}

function foldDependencySkips(errors: readonly ReportEntry[]): {
  readonly kept: ReportEntry[];
  readonly folded: Map<string, string[]>;
} {
  const failed = new Set(
    errors.filter(({ message }) => !DEPENDENCY_SKIP.test(textOf(message))).map(keyOf),
  );
  const folded = new Map<string, string[]>();
  const kept: ReportEntry[] = [];
  for (const error of errors) {
    const groups = DEPENDENCY_SKIP.exec(textOf(error.message))?.groups;
    const causeKey = groups === undefined ? undefined : keyOf({ ...error, tool: groups['cause'] });
    if (causeKey === undefined || !failed.has(causeKey)) {
      kept.push(error);
      continue;
    }
    folded.set(causeKey, [...(folded.get(causeKey) ?? []), textOf(groups?.['skipped'])]);
  }
  return { kept, folded };
}

function groupErrors(errors: readonly ReportEntry[]): ErrorGroup[] {
  const { kept, folded } = foldDependencySkips(errors);
  const groups = new Map<string, ErrorGroup>();
  for (const error of kept) {
    const key = `${error.rule === undefined ? 'headline' : 'full'}\0${textOf(error.message)}`;
    const group = groups.get(key) ?? { first: error, members: [], skipped: new Set<string>() };
    group.members.push(error);
    for (const name of folded.get(keyOf(error)) ?? []) {
      group.skipped.add(name);
    }
    groups.set(key, group);
  }
  return [...groups.values()];
}

function toolErrorHeading(
  shown: readonly ReportEntry[],
  groups: readonly ErrorGroup[],
  color: boolean,
): string {
  const distinct = groups.length < shown.length ? ` (${String(groups.length)} distinct)` : '';
  return style(
    `✖ ${String(shown.length)} ${pluralize('tool error', shown.length)}${distinct}`,
    [ANSI.bold, ANSI.red],
    { color },
  );
}

function groupLines({ first, members, skipped }: ErrorGroup, color: boolean): string[] {
  const label = style(groupLabel(members), [ANSI.yellow], { color });
  const suffix = skipped.size === 0 ? '' : ` (${[...skipped].join(', ')} skipped)`;
  if (first.rule === undefined) {
    return [`  ${label}: ${errorHeadline(first.message)}${suffix}`];
  }
  const [head = '', ...rest] = textOf(first.message).split('\n');
  return [`  ${label}: ${head}${suffix}`, ...rest.map((line) => `  ${line}`)];
}

export function toolErrorSummaryLines(
  shown: readonly ReportEntry[],
  { color, projectRoot }: SummaryOptions,
): string[] {
  if (shown.length === 0) {
    return [];
  }
  const relative = shown.map((error) => ({
    ...error,
    message: relativeToRoot(String(error.message), projectRoot),
  }));
  const groups = groupErrors(relative);
  const help = helpLineOf(shown.map(({ message }) => message));
  return [
    toolErrorHeading(shown, groups, color),
    ...groups.flatMap((group) => groupLines(group, color)),
    ...(help === undefined ? [] : [style(help, [ANSI.dim], { color })]),
  ];
}
