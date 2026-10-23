import { singleLine } from '../format/text.mjs';

export const LISTED_FINDINGS = 25;

const LISTED_TOOL_ERRORS = 10;

const LISTED_RULES = 40;

const TEXT_LIMIT = 400;

const EXCEPTION_ROUTE =
  /\s*If this is intended, add (\{.*\}) to "exceptions" in nitpicker\.config\.json\.\s*$/su;

function withoutExceptionRoute(message) {
  return String(message).replace(EXCEPTION_ROUTE, '');
}

export function exceptionExample(findings) {
  for (const finding of findings) {
    const [, entry] = EXCEPTION_ROUTE.exec(String(finding.message)) ?? [];
    if (entry !== undefined) {
      return entry;
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

export function inlineText(value, limit = TEXT_LIMIT) {
  const text = singleLine(value);
  return escapeMarkdown(text.length > limit ? `${text.slice(0, limit)}...` : text);
}

export function pluralize(count, noun) {
  return `${String(count)} ${count === 1 ? noun : `${noun}s`}`;
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
        `| ${code(entry.tool)} | ${code(entry.rule)} | ${String(entry.enforceable)} | ${String(entry.descriptive)} |`,
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

export function findingList(findings, context, heading) {
  if (findings.length === 0) {
    return [];
  }
  const shown = findings.slice(0, LISTED_FINDINGS);
  const lines = [
    `### ${heading}`,
    '',
    ...shown.map((finding) => {
      const rule = code(`${finding.tool}/${finding.rule}`);
      const message = inlineText(withoutExceptionRoute(finding.message));
      return `- ${findingLocation(finding, context)} ${rule}: ${message}`;
    }),
  ];
  if (findings.length > shown.length) {
    lines.push(
      '',
      `${String(findings.length - shown.length)} more in the report files (\`report.txt\`).`,
    );
  }
  return [...lines, ''];
}

export function toolErrorList(toolErrors) {
  if (toolErrors.length === 0) {
    return [];
  }
  const shown = toolErrors.slice(0, LISTED_TOOL_ERRORS);
  const lines = [
    `### ${pluralize(toolErrors.length, 'tool error')}`,
    '',
    'A tool error is never a pass: the run is incomplete.',
    '',
    ...shown.map((error) => {
      const label = error.snapshot === undefined ? error.tool : `${error.tool} (${error.snapshot})`;
      return `- ${code(label)}: ${inlineText(error.message)}`;
    }),
  ];
  if (toolErrors.length > shown.length) {
    lines.push('', `${String(toolErrors.length - shown.length)} more in \`report.txt\`.`);
  }
  return [...lines, ''];
}

export function exceptionRoute({ hasFindings, loosening, example }) {
  const lines = [];
  if (hasFindings) {
    lines.push(
      '- A finding that flags code that is right: the end of its message gives the entry to add to ' +
        '`exceptions` in `nitpicker.config.json` (the rule, the paths and a reason). ' +
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
  const sample =
    hasFindings && example !== undefined
      ? ['', 'An entry looks like this:', '', '```json', example, '```']
      : [];
  return ['### Disagree with a finding?', '', ...lines, ...sample, ''];
}
