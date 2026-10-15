import { createIdentityCounter, hashIdentity } from '../common.mjs';

const CHECK = /^\[([\w.-]+)\]\s*/;
const SUGGESTION = /^\s*Did you mean\b/;
const LINE_NUMBER = /\bline \d+\b/g;
const SENTENCE_END = /[.?!:]$/;
const ALLOWED_FORMS = new Map([
  [
    'NullAway',
    'Annotate what may be null with @Nullable (org.jspecify.annotations.Nullable) and check it before use; otherwise give it a non-null value.',
  ],
]);

export function ingestErrorProne(json, options = {}) {
  const diagnostics = JSON.parse(json);
  if (!Array.isArray(diagnostics)) {
    throw new TypeError('Error Prone report must be a JSON array of diagnostics');
  }
  const tool = options.tool ?? 'errorprone';
  const resolvePath = options.resolvePath ?? ((file) => file);
  const counters = new Map();
  const findings = [];
  for (const diagnostic of [...diagnostics].sort(byPosition)) {
    const parsed = parseMessage(diagnostic.message);
    const filePath = typeof diagnostic.file === 'string' ? resolvePath(diagnostic.file) : undefined;
    if (parsed !== undefined && filePath !== undefined) {
      const unique = counters.get(filePath) ?? createIdentityCounter();
      counters.set(filePath, unique);
      findings.push(finding({ tool, filePath, parsed, diagnostic, unique }));
    }
  }
  return { findings };
}

function finding({ tool, filePath, parsed, diagnostic, unique }) {
  return {
    tool,
    rule: parsed.check,
    path: filePath,
    identity: unique(
      hashIdentity('errorprone', [parsed.check, parsed.message.replace(LINE_NUMBER, 'line')]),
    ),
    message: parsed.message,
    classification: 'enforceable',
    ...location(diagnostic),
  };
}

function parseMessage(text) {
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
  if (suggestionStart === -1) {
    const allowedForm = ALLOWED_FORMS.get(check);
    return { check, message: allowedForm ? `${sentence(summary)} ${allowedForm}` : summary };
  }
  const suggestion = lines
    .slice(suggestionStart)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
  return { check, message: `${sentence(summary)} ${suggestion}` };
}

function sentence(text) {
  return SENTENCE_END.test(text) ? text : `${text}.`;
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

function compareText(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
