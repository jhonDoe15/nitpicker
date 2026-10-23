import { singleLine } from '../format/text.mjs';

export const MAX_ANNOTATIONS = 10;

const MAX_TOOL_ERROR_ANNOTATIONS = 2;

const MESSAGE_LIMIT = 1000;

export function escapeData(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

export function escapeProperty(value) {
  return escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

export function workflowCommand(command, properties, message) {
  const rendered = Object.entries(properties)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => `${name}=${escapeProperty(value)}`)
    .join(',');
  return `::${command}${rendered === '' ? '' : ` ${rendered}`}::${escapeData(message)}`;
}

function limited(value, limit = MESSAGE_LIMIT) {
  const text = String(value).trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function findingAnnotation(finding, projectPrefix) {
  return workflowCommand(
    'error',
    {
      file: finding.path === '' ? undefined : `${projectPrefix}${finding.path}`,
      line: finding.location?.line,
      col: finding.location?.column,
      title: `${finding.tool}/${finding.rule}`,
    },
    limited(finding.message),
  );
}

function toolErrorAnnotation(error) {
  const label = error.snapshot === undefined ? error.tool : `${error.tool} (${error.snapshot})`;
  return workflowCommand(
    'error',
    { title: `nitpicker tool error: ${label}` },
    limited(singleLine(error.message)),
  );
}

export function annotationLines({ findings, toolErrors, projectPrefix }) {
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
