import { DUPLICATES_MODE, LANGUAGES, RULES } from './policy.mjs';

const LANGUAGE_TITLES = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  java: 'Java',
  python: 'Python',
  kotlin: 'Kotlin',
};

const ENFORCEMENT_TEXT = {
  true: 'enforced',
  false: 'not enforced',
  partial: 'partial',
  reported: 'report-only',
};
const NOT_APPLICABLE = 'does not apply';

function cellText(rule, language) {
  return rule.notApplicable?.[language] === undefined
    ? ENFORCEMENT_TEXT[String(rule.enforcedBy[language])]
    : NOT_APPLICABLE;
}

function notApplicableNotes() {
  const notes = RULES.flatMap((rule) =>
    Object.entries(rule.notApplicable ?? {}).map(
      ([language, reason]) => `- \`${rule.id}\`, ${LANGUAGE_TITLES[language]}: ${reason}`,
    ),
  );
  return notes.length === 0 ? '' : `\nWhere a rule does not apply:\n\n${notes.join('\n')}\n`;
}

export const GENERATED_BLOCK_START = '<!-- generated:custom-rules begin (npm run gen:checks) -->';
export const GENERATED_BLOCK_END = '<!-- generated:custom-rules end -->';

/** The "Custom rules" table of `spec/checks.md`, rendered from the policy and column-aligned. */
export function renderCustomRulesTable() {
  const header = [
    'Rule',
    'Check',
    'Default limit',
    ...LANGUAGES.map((language) => LANGUAGE_TITLES[language]),
  ];
  const body = RULES.map((rule) => [
    `\`${rule.id}\``,
    `\`${rule.check}\``,
    rule.limit,
    ...LANGUAGES.map((language) => cellText(rule, language)),
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...body.map((row) => row[column].length)),
  );
  const line = (cells) => `| ${cells.map((cell, i) => cell.padEnd(widths[i])).join(' | ')} |`;
  const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;
  return `${[line(header), separator, ...body.map(line)].join('\n')}\n${notApplicableNotes()}`;
}

/** Replaces the generated block of a `spec/checks.md` text; throws when the markers are missing. */
export function applyGeneratedBlock(text) {
  const start = text.indexOf(GENERATED_BLOCK_START);
  const end = text.indexOf(GENERATED_BLOCK_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `spec/checks.md must contain the markers ${GENERATED_BLOCK_START} and ${GENERATED_BLOCK_END}`,
    );
  }
  return `${text.slice(0, start + GENERATED_BLOCK_START.length)}\n\n${renderCustomRulesTable()}\n${text.slice(end)}`;
}

/** `languages/typescript/preset/defaults/jscpd.json` with its `mode` taken from the policy (only that line changes). */
export function applyJscpdMode(text) {
  return text.replace(/("mode":\s*)"[^"]*"/, `$1${JSON.stringify(DUPLICATES_MODE)}`);
}
