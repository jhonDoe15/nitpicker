import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
import { singleLine } from '../format/text.mjs';
import {
  toolErrorHelpLine,
  troubleshootingLinkOf,
} from '../../../../shared/messages/troubleshooting.mjs';
import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
} from '../../../../shared/rules/finding-helpers.mjs';
import { ANSI, pluralize, style } from './style.mjs';

const ERROR_HEADLINE_LIMIT = 300;
const ERROR_LINE_PATTERN = /error TS\d+|Error:|ERR_|Cannot find|not found|ENOENT/u;
const DEPENDENCY_SKIP = /^(?<skipped>\S+) skipped: (?<cause>\S+) failed \(see above\)$/u;
const LISTED_NAMES = 3;
const SNAPSHOT_ORDER = ['base', 'head'];

export function withoutSkipNotices(toolErrors) {
  const listedSnapshots = new Set(
    toolErrors.filter(({ rule }) => rule === TESTS_FAILED_RULE).map(({ snapshot }) => snapshot),
  );
  return toolErrors.filter(
    ({ rule, snapshot }) => rule !== TESTS_FAILED_SKIPPED_RULE || !listedSnapshots.has(snapshot),
  );
}

export function errorHeadline(message) {
  const link = troubleshootingLinkOf(String(message));
  const text = singleLine(String(message).replace(link ?? '', ''));
  const start = Math.max(text.search(ERROR_LINE_PATTERN), 0);
  const headline = text.slice(start, start + ERROR_HEADLINE_LIMIT).trimEnd();
  const shown =
    headline.length < text.length - start
      ? `${headline}… (full text in the diagnostics file)`
      : headline;
  return link === undefined ? shown : `${shown} ${link}`;
}

function relativeToRoot(text, projectRoot) {
  const root = projectRoot?.replace(/[\\/]+$/u, '');
  if (root === undefined || root === '') {
    return text;
  }
  return text.replaceAll(
    new RegExp(`(?<![\\w.\\-/])${escapeRegExp(root)}(?![\\w-]|\\.\\w)`, 'gu'),
    '.',
  );
}

function listNames(names) {
  if (names.length <= LISTED_NAMES) {
    return names.length < 2
      ? names.join('')
      : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  }
  return `${names.slice(0, 2).join(', ')} and ${String(names.length - 2)} more`;
}

function snapshotSuffix(snapshots) {
  return snapshots.length === 0 ? '' : ` (${snapshots.join(' and ')})`;
}

function orderedSnapshots(snapshots) {
  const known = SNAPSHOT_ORDER.filter((name) => snapshots.has(name));
  const others = [...snapshots]
    .filter((name) => !SNAPSHOT_ORDER.includes(name))
    .toSorted((left, right) => left.localeCompare(right));
  return [...known, ...others];
}

function groupLabel(members) {
  const byTool = new Map();
  for (const { tool, snapshot } of members) {
    const snapshots = byTool.get(tool) ?? new Set();
    if (snapshot !== undefined) {
      snapshots.add(snapshot);
    }
    byTool.set(tool, snapshots);
  }
  const entries = [...byTool].map(([tool, snapshots]) => ({
    tool,
    snapshots: orderedSnapshots(snapshots),
  }));
  const spans = new Set(entries.map(({ snapshots }) => snapshots.join(' and ')));
  if (spans.size === 1) {
    return `${listNames(entries.map(({ tool }) => tool))}${snapshotSuffix(entries[0].snapshots)}`;
  }
  return listNames(entries.map(({ tool, snapshots }) => `${tool}${snapshotSuffix(snapshots)}`));
}

function foldDependencySkips(errors) {
  const failed = new Set(errors.filter(({ message }) => !DEPENDENCY_SKIP.test(message)).map(keyOf));
  const folded = new Map();
  const kept = [];
  for (const error of errors) {
    const { skipped, cause } = DEPENDENCY_SKIP.exec(error.message)?.groups ?? {};
    const causeKey = cause === undefined ? undefined : keyOf({ ...error, tool: cause });
    if (causeKey === undefined || !failed.has(causeKey)) {
      kept.push(error);
      continue;
    }
    folded.set(causeKey, [...(folded.get(causeKey) ?? []), skipped]);
  }
  return { kept, folded };
}

function keyOf({ tool, snapshot }) {
  return `${tool}\0${String(snapshot)}`;
}

function groupErrors(errors) {
  const { kept, folded } = foldDependencySkips(errors);
  const groups = new Map();
  for (const error of kept) {
    const key = `${error.rule === undefined ? 'headline' : 'full'}\0${error.message}`;
    const group = groups.get(key) ?? { first: error, members: [], skipped: new Set() };
    group.members.push(error);
    for (const name of folded.get(keyOf(error)) ?? []) {
      group.skipped.add(name);
    }
    groups.set(key, group);
  }
  return [...groups.values()];
}

function toolErrorHeading(shown, groups, color) {
  const distinct = groups.length < shown.length ? ` (${String(groups.length)} distinct)` : '';
  return style(
    `✖ ${String(shown.length)} ${pluralize('tool error', shown.length)}${distinct}`,
    [ANSI.bold, ANSI.red],
    color,
  );
}

function groupLines({ first, members, skipped }, color) {
  const label = style(groupLabel(members), [ANSI.yellow], color);
  const suffix = skipped.size === 0 ? '' : ` (${[...skipped].join(', ')} skipped)`;
  if (first.rule === undefined) {
    return [`  ${label}: ${errorHeadline(first.message)}${suffix}`];
  }
  const [head, ...rest] = first.message.split('\n');
  return [`  ${label}: ${head}${suffix}`, ...rest.map((line) => `  ${line}`)];
}

export function appendToolErrorSummary(lines, shown, { color, projectRoot }) {
  if (shown.length === 0) {
    return;
  }
  const relative = shown.map((error) => ({
    ...error,
    message: relativeToRoot(String(error.message), projectRoot),
  }));
  const groups = groupErrors(relative);
  lines.push(toolErrorHeading(shown, groups, color));
  for (const group of groups) {
    lines.push(...groupLines(group, color));
  }
  const help = toolErrorHelpLine(shown.map(({ message }) => message));
  if (help !== undefined) {
    lines.push(style(help, [ANSI.dim], color));
  }
}
