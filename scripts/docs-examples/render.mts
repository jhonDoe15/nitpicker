import { renderConsoleSummary } from '../../core/diff/reporting/summary.mjs';
import { renderRuleFilterSection } from '../../core/diff/reporting/text.mjs';
import { JAVA_FINDINGS, SAMPLE_FINDINGS, sampleReport } from './sample.mts';

const CONSOLE = 'console';

const PARTIAL_RUN = {
  ran: ['eslint-errors'],
  skipped: [],
  message: 'Ran only: eslint-errors. Run nitpicker without --analyzer before you finish.',
};

function console(report: object, options: object = {}): string {
  return renderConsoleSummary(report, { color: false, ...options }).replace(/^\n/u, '');
}

function command(text: string, line = 'npx nitpicker'): string {
  return `$ ${line}\n${text.replace(/\n$/u, '')}`;
}

const shortReport = sampleReport([SAMPLE_FINDINGS[0] ?? {}, SAMPLE_FINDINGS[3] ?? {}]);

export const EXAMPLE_BLOCKS: Readonly<Record<string, { language: string; text: string }>> = {
  'typescript-failing': { language: CONSOLE, text: command(console(sampleReport())) },
  'typescript-clean': { language: CONSOLE, text: command(console(sampleReport([]))) },
  'no-changes': {
    language: CONSOLE,
    text: command(console(sampleReport([], { noChanges: true }))),
  },
  'java-failing': { language: CONSOLE, text: command(console(sampleReport(JAVA_FINDINGS))) },
  'analyzer-run': {
    language: CONSOLE,
    text: command(
      console(sampleReport(SAMPLE_FINDINGS.slice(0, 1), { partialRun: PARTIAL_RUN })),
      'npx nitpicker --analyzer eslint-errors',
    ),
  },
  'rule-filter': {
    language: CONSOLE,
    text: command(
      `${console(shortReport)}${renderRuleFilterSection(shortReport, ['no-silent-catch'])}`,
      'npx nitpicker --rule no-silent-catch',
    ),
  },
  details: {
    language: CONSOLE,
    text: command(console(sampleReport(), { details: true }), 'npx nitpicker --details'),
  },
};

const BLOCK = /(?<marker><!-- example:(?<name>[a-z-]+) -->\n{1,2})```[a-z]*\n[\s\S]*?\n```/gu;

export function applyExamples(text: string): string {
  return text.replaceAll(BLOCK, (_match, marker: string, name: string) => {
    const block = EXAMPLE_BLOCKS[name];
    if (block === undefined) {
      throw new Error(`Unknown example block ${name}`);
    }
    return `${marker}\`\`\`${block.language}\n${block.text}\n\`\`\``;
  });
}
