import { singleLine } from '../format/text.mjs';
import { pluralize as pluralNoun } from '../summary.mjs';
import { ROUTE_SENTENCE } from '../../../../shared/messages/exception-sentence.mjs';

export const LISTED_FINDINGS = 25;

export const LISTED_TOOL_ERRORS = 10;

export const LISTED_NOTES = 20;

const LISTED_RULES = 40;

const TEXT_LIMIT = 400;

function withoutExceptionRoute(message) {
  const text = String(message).trimEnd();
  const route = ROUTE_SENTENCE.exec(text);
  return route === null ? text : text.slice(0, route.index).trimEnd();
}

export function exceptionExample(findings) {
  for (const finding of findings) {
    const route = ROUTE_SENTENCE.exec(String(finding.message).trimEnd());
    if (route !== null) {
      return route.groups.entry;
    }
  }
  return undefined;
}

function escapeMarkdown(value) {
  return String(value).replaceAll(/[\\`*_{}[\]<>()#+!|~&]/gu, String.raw`\$&`);
}

export function code(value) {
  return `\`${String(value).replaceAll('`', "'")}\``;
}

function cellCode(value) {
  return code(value).replaceAll('|', String.raw`\|`);
}

export function inlineText(value, limit = TEXT_LIMIT) {
  const text = singleLine(value);
  return escapeMarkdown(text.length > limit ? `${text.slice(0, limit)}...` : text);
}

export function pluralize(count, noun) {
  return `${String(count)} ${pluralNoun(noun, count)}`;
}

function encodedPath(filePath) {
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

function findingLocation(finding, { linkBase, projectPrefix }) {
  const line = finding.location?.line;
  const label = line === undefined ? finding.path : `${finding.path}:${String(line)}`;
  if (linkBase === undefined || finding.path === '') {
    return code(label);
  }
  const anchor = line === undefined ? '' : `#L${String(line)}`;
  return `[${code(label)}](${linkBase}/${encodedPath(`${projectPrefix}${finding.path}`)}${anchor})`;
}

function countsByRule(findings) {
  const counts = new Map();
  for (const finding of findings) {
    const key = `${finding.tool}\0${finding.rule}`;
    const entry = counts.get(key) ?? {
      tool: finding.tool,
      rule: finding.rule,
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

export function ruleTable(findings) {
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

export function cappedList(items, renderItem, limit) {
  const lines = items.slice(0, limit).map((item) => `- ${renderItem(item)}`);
  if (items.length > limit) {
    lines.push('', `${String(items.length - limit)} more in \`report.txt\`.`);
  }
  return [...lines, ''];
}

export function findingList(findings, context, heading) {
  if (findings.length === 0) {
    return [];
  }
  function renderFinding(finding) {
    const rule = code(`${finding.tool}/${finding.rule}`);
    const message = inlineText(withoutExceptionRoute(finding.message));
    return `${findingLocation(finding, context)} ${rule}: ${message}`;
  }
  return [`### ${heading}`, '', ...cappedList(findings, renderFinding, LISTED_FINDINGS)];
}

export function toolErrorList(toolErrors) {
  if (toolErrors.length === 0) {
    return [];
  }
  function renderError(error) {
    const label = error.snapshot === undefined ? error.tool : `${error.tool} (${error.snapshot})`;
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

export function exceptionRoute({ hasFindings, loosening, example }) {
  const lines = [];
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
      '- A loosening of `nitpicker.config.json` fails until a repository admin has reviewed it and ' +
        `set the repository variable \`NITPICKER_ACCEPT_POLICY_CHANGE\` to ${code(loosening)}, ` +
        'then re-run the job. The digest covers exactly the loosenings listed above.',
    );
  }
  if (lines.length === 0) {
    return [];
  }
  const sample = hasFindings && example !== undefined ? ['', '```json', example, '```'] : [];
  return ['### Disagree with a finding?', '', ...lines, ...sample, ''];
}
