import { createIdentityCounter, hashIdentity } from '../../../../shared/ingest/common.mjs';
import { withoutClassLiteralRepeats } from './class-literals.mts';
import { diagnosticOf, type Diagnostic } from './diagnostic.mts';
import { compareText } from '../../../../shared/paths/path-order.mjs';
import { definedField } from '../../../../shared/messages/messages.mjs';
import { errorProneAllowedForm, errorProneMessage } from './messages.mts';
import { listOf, numberOr, parseJson } from '../../../../shared/values/readers.mts';

const CHECK = /^\[([\w.-]+)\]\s*/;
const SUGGESTION = /^\s*Did you mean\b/;
const LINE_NUMBER = /\bline \d+\b/g;
type IngestOptions = {
  readonly tool?: string;
  readonly resolvePath?: (file: string) => string | undefined;
  readonly guava?: (filePath: string) => boolean;
};

type Parsed = {
  readonly check: string;
  readonly summary: string;
  readonly message: string;
};

type Distinct = {
  readonly diagnostic: Diagnostic;
  readonly parsed: Parsed;
  readonly filePath: string;
};

export function ingestErrorProne(
  json: string,
  options: IngestOptions = {},
): { findings: Record<string, unknown>[] } {
  const parsedJson = parseJson(json);
  if (!Array.isArray(parsedJson)) {
    throw new TypeError('Error Prone report must be a JSON array of diagnostics');
  }
  const diagnostics = listOf(parsedJson).map(diagnosticOf);
  const tool = options.tool ?? 'errorprone';
  const resolvePath = options.resolvePath ?? ((file: string) => file);
  const counters = new Map<string, (identity: string) => string>();
  const findings = distinctDiagnostics(diagnostics, resolvePath, options.guava ?? (() => true)).map(
    ({ diagnostic, parsed, filePath }) => {
      const unique = counters.get(filePath) ?? createIdentityCounter();
      counters.set(filePath, unique);
      return finding({ tool, filePath, parsed, diagnostic, unique });
    },
  );
  return { findings };
}

function distinctDiagnostics(
  diagnostics: readonly Diagnostic[],
  resolvePath: (file: string) => string | undefined,
  guava: (filePath: string) => boolean,
): Distinct[] {
  const reported = new Set<string>();
  return withoutClassLiteralRepeats(diagnostics)
    .sort(byPosition)
    .flatMap((diagnostic) => {
      const file = diagnostic.file;
      const filePath = typeof file === 'string' ? resolvePath(file) : undefined;
      const parsed = parseMessage(diagnostic.message, filePath === undefined || guava(filePath));
      const position = [filePath, diagnostic.line, diagnostic.column];
      const key = JSON.stringify([...position, parsed?.check, parsed?.message]);
      if (parsed === undefined || filePath === undefined || reported.has(key)) {
        return [];
      }
      reported.add(key);
      return [{ diagnostic, parsed, filePath }];
    });
}

type FindingInput = Distinct & {
  readonly tool: string;
  readonly unique: (identity: string) => string;
};

function finding({ tool, filePath, parsed, diagnostic, unique }: FindingInput) {
  return {
    tool,
    rule: parsed.check,
    path: filePath,
    identity: unique(
      hashIdentity('errorprone', [parsed.check, parsed.summary.replace(LINE_NUMBER, 'line')]),
    ),
    message: parsed.message,
    ...definedField('allowedForm', errorProneAllowedForm(parsed.check)),
    classification: 'enforceable',
    ...location(diagnostic),
  };
}

function parseMessage(text: unknown, guava: boolean): Parsed | undefined {
  if (typeof text !== 'string') {
    return undefined;
  }
  const lines = text.split(/\r?\n/);
  const first = lines[0] ?? '';
  const match = CHECK.exec(first);
  const check = match?.[1];
  if (match === null || check === undefined) {
    return undefined;
  }
  const summary = first.slice(match[0].length).trim() || check;
  const suggestionStart = lines.findIndex((line) => SUGGESTION.test(line));
  const suggestion =
    suggestionStart === -1
      ? undefined
      : lines
          .slice(suggestionStart)
          .map((line) => line.trim())
          .filter(Boolean)
          .join(' ');
  return { check, summary, message: errorProneMessage({ check, summary, suggestion }, { guava }) };
}

function location(diagnostic: Diagnostic): { location?: { line: number; column?: number } } {
  const line = numberOr(diagnostic.line, 0);
  const column = numberOr(diagnostic.column, 0);
  if (!Number.isInteger(line) || line < 1) {
    return {};
  }
  return { location: Number.isInteger(column) && column >= 1 ? { line, column } : { line } };
}

function byPosition(left: Diagnostic, right: Diagnostic): number {
  return (
    compareText(String(left.file), String(right.file)) ||
    numberOr(left.line, 0) - numberOr(right.line, 0) ||
    numberOr(left.column, 0) - numberOr(right.column, 0)
  );
}
