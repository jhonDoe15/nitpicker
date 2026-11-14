import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

export type FindingSection = readonly [heading: string, findings: readonly ReportEntry[]];

export function findingSectionLines(heading: string, findings: readonly ReportEntry[]): string[] {
  if (findings.length === 0) {
    return [];
  }
  return [
    '',
    `${heading}:`,
    ...findings.map((finding) => {
      const location =
        finding['location'] === undefined ? '' : `:${textOf(fieldOf(finding['location'], 'line'))}`;
      const rule = `${textOf(finding.tool)}/${textOf(finding.rule)}`;
      return `${rule} ${textOf(finding.path)}${location} ${textOf(finding.message)}`;
    }),
  ];
}

export function ruleFilterSection(
  ruleFilters: readonly string[],
  sections: readonly FindingSection[],
): string {
  if (ruleFilters.length === 0) {
    return '';
  }
  function matches(finding: ReportEntry): boolean {
    return ruleFilters.some((filter) =>
      `${textOf(finding.tool)}/${textOf(finding.rule)}`.includes(filter),
    );
  }
  const lines = [
    '',
    `Findings matching --rule ${ruleFilters.join(', ')}:`,
    ...sections.flatMap(([heading, findings]) =>
      findingSectionLines(heading, findings.filter(matches)),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

export function toolErrorSectionLines(toolErrors: readonly ReportEntry[]): string[] {
  if (toolErrors.length === 0) {
    return [];
  }
  return [
    '',
    'Tool errors:',
    ...toolErrors.map(
      (error) => `${textOf(error.tool)} (${textOf(error.snapshot)}): ${textOf(error.message)}`,
    ),
  ];
}
