import { reportedPath } from './coverage-reports/coverage-paths.mts';
import { createIdentities } from './identities.mts';
import { parsePyrightReport } from './typed/type-check-types.mts';
import type { PyrightDiagnostic, PyrightReport } from './typed/type-check-types.mts';
import type { IngestedFinding } from './typed/ingest-types.mts';

type FindingInput = {
  readonly path: string;
  readonly rule: string;
  readonly subject: string;
  readonly severity: string;
  readonly line: number;
  readonly column: number | undefined;
};

type FindingBuilder = (input: FindingInput) => IngestedFinding;
type Roots = readonly (string | undefined)[];

const MYPY_LINE = /^(.+?):(\d+):(?:(\d+):)? (error|warning): (.*)$/;
const ERROR_CODE = /\s\[([\w-]+)\]$/;
const FALLBACK_RULE = 'type-error';
const ENFORCEABLE_SEVERITIES = new Set(['error', 'warning']);

function messageAndCode(text: string): { message: string; rule: string } {
  const code = ERROR_CODE.exec(text);
  return code === null
    ? { message: text, rule: FALLBACK_RULE }
    : { message: text.slice(0, code.index).trimEnd(), rule: code[1] ?? FALLBACK_RULE };
}

function createFindingBuilder(tool: string): FindingBuilder {
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

export function ingestMypy(text: string, { roots }: { roots: Roots }): IngestedFinding[] {
  const build = createFindingBuilder('mypy');
  return text
    .split(/\r?\n/)
    .map((line) => MYPY_LINE.exec(line))
    .filter((match) => match !== null)
    .flatMap(([, file = '', line = '', column, severity = '', text = '']) => {
      const path = reportedPath(file, roots);
      const { message, rule } = messageAndCode(text);
      return path === undefined
        ? []
        : [
            build({
              path,
              rule,
              subject: message,
              severity,
              line: Number(line),
              column: column === undefined ? undefined : Number(column),
            }),
          ];
    });
}

function jsonObject(text: string, tool: string): PyrightReport {
  const start = text.indexOf('{');
  if (start === -1) {
    throw new SyntaxError(`${tool} printed no JSON report`);
  }
  return parsePyrightReport(text.slice(start));
}

function pyrightFinding(
  diagnostic: PyrightDiagnostic,
  { roots, build }: { roots: Roots; build: FindingBuilder },
): IngestedFinding[] {
  const path = reportedPath(diagnostic.file, roots);
  if (path === undefined) {
    return [];
  }
  const [subject = ''] = diagnostic.message.split('\n');
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

export function ingestPyright(
  text: string,
  { roots, tool = 'pyright' }: { roots: Roots; tool?: string },
): IngestedFinding[] {
  const build = createFindingBuilder(tool);
  const { generalDiagnostics = [] } = jsonObject(text, tool);
  return generalDiagnostics.flatMap((diagnostic) => pyrightFinding(diagnostic, { roots, build }));
}
