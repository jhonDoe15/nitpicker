import { DUPLICATES_MODE, LANGUAGES, RULES } from './policy.mts';
import { largest } from './lists/lists.mts';
import type { ColumnedRule } from './project-rules/typed/rule-types.mts';

const LANGUAGE_TITLES: Readonly<Record<string, string>> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  java: 'Java',
  python: 'Python',
  kotlin: 'Kotlin',
  go: 'Go',
};

const ENFORCEMENT_TEXT: Readonly<Record<string, string>> = {
  true: 'enforced',
  false: 'not enforced',
  partial: 'partial',
  reported: 'report-only',
};
const REPORT_ONLY_TEXT: Readonly<Record<string, string>> = {
  true: 'report-only',
  false: 'not enforced',
  partial: 'partial, report-only',
};
const NOT_APPLICABLE = 'does not apply';

function cellText(rule: ColumnedRule, language: string): string {
  if (rule.notApplicable?.[language] !== undefined) {
    return NOT_APPLICABLE;
  }
  return (
    (rule.reportOnly === true ? REPORT_ONLY_TEXT : ENFORCEMENT_TEXT)[
      String(rule.enforcedBy[language])
    ] ?? ''
  );
}

function notApplicableNotes(): string {
  const notes = RULES.flatMap((rule) =>
    Object.entries(rule.notApplicable ?? {}).map(
      ([language, reason]) =>
        `- \`${rule.id}\`, ${LANGUAGE_TITLES[language] ?? language}: ${reason}`,
    ),
  );
  return notes.length === 0 ? '' : `\nWhere a rule does not apply:\n\n${notes.join('\n')}\n`;
}

export const GENERATED_BLOCK_START = '<!-- generated:custom-rules begin (npm run gen:checks) -->';
export const GENERATED_BLOCK_END = '<!-- generated:custom-rules end -->';

export function renderCustomRulesTable(): string {
  const header = [
    'Rule',
    'Check',
    'Default limit',
    ...LANGUAGES.map((language) => LANGUAGE_TITLES[language] ?? language),
  ];
  const body = RULES.map((rule): string[] => [
    `\`${rule.id}\``,
    `\`${rule.check}\``,
    rule.limit,
    ...LANGUAGES.map((language) => cellText(rule, language)),
  ]);
  const widths = header.map((title, column) =>
    largest([title.length, ...body.map((row) => (row[column] ?? '').length)]),
  );
  function line(cells: readonly string[]): string {
    return `| ${cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join(' | ')} |`;
  }
  const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;
  return `${[line(header), separator, ...body.map(line)].join('\n')}\n${notApplicableNotes()}`;
}

export function applyGeneratedBlock(text: string): string {
  const start = text.indexOf(GENERATED_BLOCK_START);
  const end = text.indexOf(GENERATED_BLOCK_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `spec/checks.md must contain the markers ${GENERATED_BLOCK_START} and ${GENERATED_BLOCK_END}`,
    );
  }
  return `${text.slice(0, start + GENERATED_BLOCK_START.length)}\n\n${renderCustomRulesTable()}\n${text.slice(end)}`;
}

export function applyJscpdMode(text: string): string {
  return text.replace(/("mode":\s*)"[^"]*"/, `$1${JSON.stringify(DUPLICATES_MODE)}`);
}
