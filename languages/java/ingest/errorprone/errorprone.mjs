import { createIdentityCounter, hashIdentity } from '../../../../shared/ingest/common.mjs';
import { withoutClassLiteralRepeats } from './class-literals.mjs';
import { errorProneMessage } from './messages.mjs';
import { compareText } from '../../../../shared/paths/path-order.mjs';

const CHECK = /^\[([\w.-]+)\]\s*/;
const SUGGESTION = /^\s*Did you mean\b/;
const LINE_NUMBER = /\bline \d+\b/g;
export function ingestErrorProne(json, options = {}) {
  const diagnostics = JSON.parse(json);
  if (!Array.isArray(diagnostics)) {
    throw new TypeError('Error Prone report must be a JSON array of diagnostics');
  }
  const tool = options.tool ?? 'errorprone';
  const resolvePath = options.resolvePath ?? ((file) => file);
  const counters = new Map();
  const findings = distinctDiagnostics(diagnostics, resolvePath, options.guava ?? (() => true)).map(
    ({ diagnostic, parsed, filePath }) => {
      const unique = counters.get(filePath) ?? createIdentityCounter();
      counters.set(filePath, unique);
      return finding({ tool, filePath, parsed, diagnostic, unique });
    },
  );
  return { findings };
}

function distinctDiagnostics(diagnostics, resolvePath, guava) {
  const reported = new Set();
  return withoutClassLiteralRepeats(diagnostics)
    .sort(byPosition)
    .flatMap((diagnostic) => {
      const filePath =
        typeof diagnostic.file === 'string' ? resolvePath(diagnostic.file) : undefined;
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

function finding({ tool, filePath, parsed, diagnostic, unique }) {
  return {
    tool,
    rule: parsed.check,
    path: filePath,
    identity: unique(
      hashIdentity('errorprone', [parsed.check, parsed.summary.replace(LINE_NUMBER, 'line')]),
    ),
    message: parsed.message,
    classification: 'enforceable',
    ...location(diagnostic),
  };
}

function parseMessage(text, guava) {
  if (typeof text !== 'string') {
    return undefined;
  }
  const lines = text.split(/\r?\n/);
  const match = CHECK.exec(lines[0]);
  if (match === null) {
    return undefined;
  }
  const check = match[1];
  const summary = lines[0].slice(match[0].length).trim() || check;
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

function location({ line, column }) {
  if (!Number.isInteger(line) || line < 1) {
    return {};
  }
  return { location: Number.isInteger(column) && column >= 1 ? { line, column } : { line } };
}

function byPosition(left, right) {
  return (
    compareText(String(left.file), String(right.file)) ||
    (left.line ?? 0) - (right.line ?? 0) ||
    (left.column ?? 0) - (right.column ?? 0)
  );
}
