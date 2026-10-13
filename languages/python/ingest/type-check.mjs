import { normalizeReportPath } from '../../java/ingest/common.mjs';
import { createIdentities } from './identities.mjs';

const MYPY_LINE = /^(.+?):(\d+):(?:(\d+):)? (error|warning): (.*?)(?:\s+\[([\w-]+)\])?$/;
const FALLBACK_RULE = 'type-error';
const ENFORCEABLE_SEVERITIES = new Set(['error', 'warning']);

function projectPath(file, roots) {
  return roots
    .map((root) => normalizeReportPath(file, root))
    .find((candidate) => candidate !== undefined);
}

function createFindingBuilder(tool) {
  const identify = createIdentities();
  return ({ path, rule, subject, severity, line, column }) => ({
    tool,
    rule,
    path,
    identity: identify({ path, rule, subject }),
    message: subject,
    classification: ENFORCEABLE_SEVERITIES.has(severity) ? 'enforceable' : 'descriptive',
    location: { line, ...(column === undefined ? {} : { column }) },
  });
}

export function ingestMypy(text, { roots }) {
  const build = createFindingBuilder('mypy');
  return text
    .split(/\r?\n/)
    .map((line) => MYPY_LINE.exec(line))
    .filter((match) => match !== null)
    .flatMap(([, file, line, column, severity, message, code]) => {
      const path = projectPath(file, roots);
      return path === undefined
        ? []
        : [
            build({
              path,
              rule: code ?? FALLBACK_RULE,
              subject: message,
              severity,
              line: Number(line),
              column: column === undefined ? undefined : Number(column),
            }),
          ];
    });
}

function jsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) {
    throw new SyntaxError('pyright printed no JSON report');
  }
  return JSON.parse(text.slice(start));
}

function pyrightFinding(diagnostic, { roots, build }) {
  const path = projectPath(diagnostic.file, roots);
  if (path === undefined) {
    return [];
  }
  const [subject] = diagnostic.message.split('\n');
  const start = diagnostic.range?.start;
  return [
    build({
      path,
      rule: diagnostic.rule ?? FALLBACK_RULE,
      subject,
      severity: diagnostic.severity,
      line: (start?.line ?? 0) + 1,
      column: start === undefined ? undefined : start.character + 1,
    }),
  ];
}

export function ingestPyright(text, { roots }) {
  const build = createFindingBuilder('pyright');
  const { generalDiagnostics = [] } = jsonObject(text);
  return generalDiagnostics.flatMap((diagnostic) => pyrightFinding(diagnostic, { roots, build }));
}
