import { singleLine } from '../format/text.mjs';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

type Annotations = {
  readonly findings: readonly ReportEntry[];
  readonly toolErrors: readonly ReportEntry[];
  readonly projectPrefix: string;
};

const oneLine: (value: unknown) => string = singleLine;

export const MAX_ANNOTATIONS = 10;

export const MAX_TOOL_ERROR_ANNOTATIONS = 2;

const MESSAGE_LIMIT = 1000;

export function escapeData(value: unknown): string {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

export function escapeProperty(value: unknown): string {
  return escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

export function workflowCommand(
  command: string,
  properties: Readonly<Record<string, unknown>>,
  message: unknown,
): string {
  const rendered = Object.entries(properties)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => `${name}=${escapeProperty(value)}`)
    .join(',');
  return `::${command}${rendered === '' ? '' : ` ${rendered}`}::${escapeData(message)}`;
}

function limited(value: unknown, limit = MESSAGE_LIMIT): string {
  const text = String(value).trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function findingAnnotation(finding: ReportEntry, projectPrefix: string): string {
  return workflowCommand(
    'error',
    {
      file: finding.path === '' ? undefined : `${projectPrefix}${textOf(finding.path)}`,
      line: fieldOf(finding['location'], 'line'),
      col: fieldOf(finding['location'], 'column'),
      title: `${textOf(finding.tool)}/${textOf(finding.rule)}`,
    },
    limited(finding.message),
  );
}

function toolErrorAnnotation(error: ReportEntry): string {
  const label =
    error.snapshot === undefined
      ? textOf(error.tool)
      : `${textOf(error.tool)} (${textOf(error.snapshot)})`;
  return workflowCommand(
    'error',
    { title: `nitpicker tool error: ${label}` },
    limited(oneLine(error.message)),
  );
}

export function annotationLines({ findings, toolErrors, projectPrefix }: Annotations): string[] {
  const shownErrors = toolErrors.slice(0, MAX_TOOL_ERROR_ANNOTATIONS);
  const shownFindings = findings.slice(0, MAX_ANNOTATIONS - shownErrors.length);
  const lines = [
    ...shownErrors.map(toolErrorAnnotation),
    ...shownFindings.map((finding) => findingAnnotation(finding, projectPrefix)),
  ];
  const omitted = findings.length - shownFindings.length + toolErrors.length - shownErrors.length;
  if (omitted > 0) {
    lines.push(
      workflowCommand(
        'notice',
        { title: 'nitpicker' },
        `${String(omitted)} more ${omitted === 1 ? 'problem is' : 'problems are'} not annotated ` +
          `(GitHub shows at most ${String(MAX_ANNOTATIONS)} error annotations per step). ` +
          'See the job summary and the report files.',
      ),
    );
  }
  return lines;
}
