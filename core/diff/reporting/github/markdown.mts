import { singleLine } from '../format/text.mjs';
import { pluralize as nounFor } from '../summary.mts';
import { ROUTE_SENTENCE } from '../../../../shared/messages/exception-sentence.mjs';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

export type LinkContext = {
  readonly linkBase: string | undefined;
  readonly projectPrefix: string;
};

type RuleCount = { tool: string; rule: string; enforceable: number; descriptive: number };

type ExceptionRoute = {
  readonly hasFindings: boolean;
  readonly loosening?: unknown;
  readonly example: string | undefined;
};

const oneLine: (value: unknown) => string = singleLine;
const routeSentence: RegExp = ROUTE_SENTENCE;

export const LISTED_FINDINGS = 25;

export const LISTED_TOOL_ERRORS = 10;

export const LISTED_NOTES = 20;

const LISTED_RULES = 40;

const TEXT_LIMIT = 400;

function withoutExceptionRoute(message: unknown): string {
  const text = String(message).trimEnd();
  const route = routeSentence.exec(text);
  return route === null ? text : text.slice(0, route.index).trimEnd();
}

export function exceptionExample(findings: readonly ReportEntry[]): string | undefined {
  for (const finding of findings) {
    const route = routeSentence.exec(String(finding.message).trimEnd());
    if (route !== null) {
      return route.groups?.['entry'];
    }
  }
  return undefined;
}

function escapeMarkdown(value: unknown): string {
  return String(value).replaceAll(/[\\`*_{}[\]<>()#+!|~&]/gu, String.raw`\$&`);
}

export function code(value: unknown): string {
  return `\`${String(value).replaceAll('`', "'")}\``;
}

function cellCode(value: unknown): string {
  return code(value).replaceAll('|', String.raw`\|`);
}

export function inlineText(value: unknown, limit = TEXT_LIMIT): string {
  const text = oneLine(value);
  return escapeMarkdown(text.length > limit ? `${text.slice(0, limit)}...` : text);
}

export function pluralize(count: number, noun: string): string {
  return `${String(count)} ${nounFor(noun, count)}`;
}

function encodedPath(filePath: string): string {
  return filePath
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment)
        .replaceAll('(', '%28')
        .replaceAll(')', '%29')
        .replaceAll("'", '%27'),
    )
    .join('/');
}

function findingLocation(finding: ReportEntry, { linkBase, projectPrefix }: LinkContext): string {
  const line = fieldOf(finding['location'], 'line');
  const path = textOf(finding.path);
  const label = line === undefined ? finding.path : `${path}:${String(line)}`;
  if (linkBase === undefined || finding.path === '') {
    return code(label);
  }
  const anchor = line === undefined ? '' : `#L${String(line)}`;
  return `[${code(label)}](${linkBase}/${encodedPath(`${projectPrefix}${path}`)}${anchor})`;
}

function countsByRule(findings: readonly ReportEntry[]): RuleCount[] {
  const counts = new Map<string, RuleCount>();
  for (const finding of findings) {
    const tool = textOf(finding.tool);
    const rule = textOf(finding.rule);
    const key = `${tool}\0${rule}`;
    const entry = counts.get(key) ?? {
      tool,
      rule,
      enforceable: 0,
      descriptive: 0,
    };
    entry[finding.classification === 'enforceable' ? 'enforceable' : 'descriptive'] += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort(
    (left, right) =>
      right.enforceable - left.enforceable ||
      right.descriptive - left.descriptive ||
      left.tool.localeCompare(right.tool) ||
      left.rule.localeCompare(right.rule),
  );
}

export function ruleTable(findings: readonly ReportEntry[]): string[] {
  if (findings.length === 0) {
    return [];
  }
  const counts = countsByRule(findings);
  const rows = counts
    .slice(0, LISTED_RULES)
    .map(
      (entry) =>
        `| ${cellCode(entry.tool)} | ${cellCode(entry.rule)} | ${String(entry.enforceable)} | ${String(entry.descriptive)} |`,
    );
  const omitted = counts.length - rows.length;
  return [
    '| Tool | Rule | Enforceable | Descriptive |',
    '| --- | --- | ---: | ---: |',
    ...rows,
    '',
    ...(omitted > 0 ? [`${String(omitted)} more rules in \`report.txt\`.`, ''] : []),
  ];
}

export function cappedList<T>(
  items: readonly T[],
  renderItem: (item: T) => string,
  limit: number,
): string[] {
  const lines = items.slice(0, limit).map((item) => `- ${renderItem(item)}`);
  if (items.length > limit) {
    lines.push('', `${String(items.length - limit)} more in \`report.txt\`.`);
  }
  return [...lines, ''];
}

export function findingList(
  findings: readonly ReportEntry[],
  context: LinkContext,
  heading: string,
): string[] {
  if (findings.length === 0) {
    return [];
  }
  function renderFinding(finding: ReportEntry): string {
    const rule = code(`${textOf(finding.tool)}/${textOf(finding.rule)}`);
    const message = inlineText(withoutExceptionRoute(finding.message));
    return `${findingLocation(finding, context)} ${rule}: ${message}`;
  }
  return [`### ${heading}`, '', ...cappedList(findings, renderFinding, LISTED_FINDINGS)];
}

export function toolErrorList(toolErrors: readonly ReportEntry[]): string[] {
  if (toolErrors.length === 0) {
    return [];
  }
  function renderError(error: ReportEntry): string {
    const label =
      error.snapshot === undefined
        ? error.tool
        : `${textOf(error.tool)} (${textOf(error.snapshot)})`;
    return `${code(label)}: ${inlineText(error.message)}`;
  }
  return [
    `### ${pluralize(toolErrors.length, 'tool error')}`,
    '',
    'A tool error is never a pass: the run is incomplete.',
    '',
    ...cappedList(toolErrors, renderError, LISTED_TOOL_ERRORS),
  ];
}

export function exceptionRoute({ hasFindings, loosening, example }: ExceptionRoute): string[] {
  const lines: string[] = [];
  if (hasFindings) {
    const entry =
      example === undefined
        ? 'add an entry to `exceptions` in `nitpicker.config.json`'
        : 'add an entry like the example below to `exceptions` in `nitpicker.config.json`';
    lines.push(
      `- A finding that flags code that is right: ${entry}, with the rule, the paths and a reason. ` +
        'The message of each finding in `report.txt` ends with its own entry. ' +
        'Reviewers see the entry and every report lists it.',
    );
  }
  if (loosening !== undefined) {
    lines.push(
      '- A loosening of `nitpicker.config.json` fails until a person with write access has ' +
        'reviewed it and added the `accept-policy-change` label to the pull request, which ' +
        'accepts the loosenings of this commit and runs the job again (a later push needs the ' +
        'label again). Without the approval workflow, set the repository variable ' +
        `\`NITPICKER_ACCEPT_POLICY_CHANGE\` to ${code(loosening)}, which covers exactly the ` +
        'loosenings listed above, and re-run the job.',
    );
  }
  if (lines.length === 0) {
    return [];
  }
  const sample = hasFindings && example !== undefined ? ['', '```json', example, '```'] : [];
  return ['### Disagree with a finding?', '', ...lines, ...sample, ''];
}
