import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readHeadPolicyFile as untypedHeadPolicy } from '../../../../shared/head-policy.mjs';
import { testConsoleFindings as untypedFindings } from '../../../../shared/rules/console/console-findings.mjs';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';
import type { ToolProject } from '../typed/context/tool-context-types.mts';
import type { ConsoleManifest, ConsoleReport } from './typed/console-types.mts';

const readHeadPolicyFile: () => Readonly<Record<string, unknown>> = untypedHeadPolicy;
const testConsoleFindings: (
  report: ConsoleReport,
  options: { analyzerName: string; allow: readonly unknown[]; exceptions: undefined },
) => IngestedFinding[] = untypedFindings;

export const TEST_CONSOLE_TOOL = 'test-console';
const CONSOLE_REPORT = 'test-console.json';
const REPORT_VARIABLE = 'NITPICKER_CONSOLE_REPORT';
const REPORT_MISSING_RULE = 'test-console-report-missing';

export function consoleReportEnvironment({
  project,
  reportRoot,
}: {
  readonly project: Pick<ToolProject, 'testRunner'>;
  readonly reportRoot: string;
}): Record<string, string> {
  return project.testRunner === 'pytest'
    ? { [REPORT_VARIABLE]: path.join(reportRoot, CONSOLE_REPORT) }
    : {};
}

function isConsoleReport(value: unknown): value is ConsoleReport {
  return Array.isArray(fieldOf(value, 'entries'));
}

function missingReportFinding(): IngestedFinding {
  return {
    tool: TEST_CONSOLE_TOOL,
    rule: REPORT_MISSING_RULE,
    path: '.',
    identity: REPORT_MISSING_RULE,
    message: `Test console output was not checked: the pytest run left no ${CONSOLE_REPORT}. nitpicker's console plugin writes it first thing when pytest unconfigures, so the run ended before that: the pytest process was killed or ended itself without unwinding.`,
    classification: 'tool-error',
  };
}

export function readConsoleReport(
  reportRoot: string,
  { testRunner, testsRan }: ConsoleManifest = {},
): { report: ConsoleReport; findings: IngestedFinding[] } {
  const file = path.join(reportRoot, CONSOLE_REPORT);
  if (existsSync(file)) {
    const report: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!isConsoleReport(report)) {
      throw new TypeError(`${CONSOLE_REPORT} has no entries list`);
    }
    return { report, findings: [] };
  }
  const missing = testRunner === 'pytest' && testsRan === true;
  return { report: { entries: [] }, findings: missing ? [missingReportFinding()] : [] };
}

export function projectRelative(projectRoot: string, file: string): string {
  const relative = path.relative(projectRoot, file).split(path.sep).join('/');
  return file === '' || relative.startsWith('..') ? '.' : relative;
}

export function consoleFacts(
  report: ConsoleReport,
  projectRoot: string,
): { file: string; test: string; messages: readonly string[] }[] {
  return report.entries.map(({ file, test, messages }) => ({
    file: file === '' ? '' : projectRelative(projectRoot, file),
    test,
    messages,
  }));
}

export function consoleOutputFindings(
  report: ConsoleReport,
  {
    projectRoot,
    headPolicy = readHeadPolicyFile(),
  }: { readonly projectRoot: string; readonly headPolicy?: Readonly<Record<string, unknown>> },
): IngestedFinding[] {
  return testConsoleFindings(
    { entries: consoleFacts(report, projectRoot) },
    {
      analyzerName: TEST_CONSOLE_TOOL,
      allow: listOf(fieldOf(headPolicy['testConsole'], 'allow')),
      exceptions: undefined,
    },
  );
}

export function readConsoleFindings(
  reportRoot: string,
  { projectRoot, manifest }: { readonly projectRoot: string; readonly manifest: ConsoleManifest },
): IngestedFinding[] {
  const { report, findings } = readConsoleReport(reportRoot, manifest);
  return [...findings, ...consoleOutputFindings(report, { projectRoot })];
}
