import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ownedNativeChecker, ownedNativeMessage } from './native/owned-native-rules.mjs';
import { reportedRuleKey } from './oxlint-translation.mjs';

const SENTINEL_HINT = / Unused [a-z ]+ should match \/\[\^\\s\\S\]\/\./gu;
const IRREGULAR_WHITESPACE_RULE = 'no-irregular-whitespace';
const MESSAGE_IN_HELP_RULES = new Set(['no-restricted-imports', 'no-restricted-properties']);
const TSCONFIG_ERROR_CODE = 'typescript(tsconfig-error)';
const TOLERATED_TSCONFIG_ERRORS = [
  /Cannot find type definition file/u,
  /Option '[^']+' (?:has been removed|is deprecated)/u,
];

export function eslintShapedResults(stage, diagnostics, naming) {
  const reported = distinctDiagnostics(diagnostics).filter(
    (diagnostic) => !isIgnoredDiagnostic(diagnostic),
  );
  const byFile = Map.groupBy(reported, (diagnostic) => diagnostic.filename);
  return [...byFile].map(([filename, fileDiagnostics]) => {
    const filePath = filename.replaceAll('\\', '/');
    const bytes = readFileSync(stagedFile(stage, filename));
    const locate = byteLocator(bytes);
    const neutralized = naming.neutralized.get(filePath) ?? new Set();
    const converted = fileDiagnostics.map((diagnostic) =>
      eslintMessage(diagnostic, naming, { filePath, locate }),
    );
    const keeps = converted.some(({ check }) => check !== undefined)
      ? ownedNativeChecker(filePath, bytes.toString('utf8'))
      : undefined;
    return {
      filePath,
      messages: converted
        .filter(({ check }) => check === undefined || keeps(check))
        .map(({ message }) => message)
        .filter((message) => !isNeutralizerWhitespace(message, neutralized)),
    };
  });
}

function stagedFile(stage, filename) {
  const full = path.resolve(stage, filename);
  if (!full.startsWith(`${stage}${path.sep}`)) {
    throw new Error(`oxlint reported a file outside its stage: ${filename}`);
  }
  return full;
}

function distinctDiagnostics(diagnostics) {
  const seen = new Set();
  return diagnostics.filter((diagnostic) => {
    const key = JSON.stringify([
      diagnostic.filename,
      diagnostic.code,
      diagnostic.labels?.[0]?.span?.offset,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isNeutralizerWhitespace(message, neutralized) {
  return (
    message.ruleId === IRREGULAR_WHITESPACE_RULE &&
    neutralized.has(`${String(message.line)}:${String(message.column)}`)
  );
}

function isIgnoredDiagnostic(diagnostic) {
  if (diagnostic.code === TSCONFIG_ERROR_CODE) {
    const text = `${diagnostic.message} ${diagnostic.help ?? ''}`;
    return TOLERATED_TSCONFIG_ERRORS.some((pattern) => pattern.test(text));
  }
  return diagnostic.code === undefined && diagnostic.message.startsWith('Unused oxlint-');
}

function isUnusedEslintDirective(diagnostic) {
  return diagnostic.code === undefined && diagnostic.message.startsWith('Unused eslint-');
}

function reportedPosition(diagnostic, locate) {
  const span = diagnostic.labels?.[0]?.span ?? { offset: 0, length: 0 };
  const start = locate(span.offset);
  const end = locate(span.offset + span.length);
  return { line: start.line, column: start.column, endLine: end.line, endColumn: end.column };
}

function eslintMessage(diagnostic, naming, file) {
  const position = reportedPosition(diagnostic, file.locate);
  const key = reportedRuleKey(diagnostic.code);
  if (isUnusedEslintDirective(diagnostic)) {
    return {
      message: { ruleId: undefined, message: diagnostic.message, severity: 1, ...position },
    };
  }
  if (key === undefined) {
    return { message: { fatal: true, message: diagnostic.message, severity: 2, ...position } };
  }
  const ruleId = naming.ruleNames.get(key);
  if (ruleId === undefined) {
    throw new Error(
      `oxlint reported ${diagnostic.code}: ${diagnostic.message} ${diagnostic.help ?? ''}`.trim(),
    );
  }
  return ruleMessage({ diagnostic, ruleId, naming, position, file });
}

function ruleMessage({ diagnostic, ruleId, naming, position, file }) {
  const { messageIdOf, ruleMessages = {} } = naming;
  const { filePath, locate } = file;
  const owned = ownedNativeMessage({ ruleId, diagnostic, ruleMessages, filePath });
  if (owned !== undefined) {
    const { messageId, message, check } = owned;
    const { spreadOffset, ...rest } = check;
    return {
      message: { ruleId, messageId, message, severity: 2, ...position },
      check: { ...rest, spread: locate(spreadOffset) },
    };
  }
  const message = withoutSentinelHint(configuredMessage(diagnostic, ruleId));
  return {
    message: { ruleId, messageId: messageIdOf(ruleId, message), message, severity: 2, ...position },
  };
}

function configuredMessage(diagnostic, ruleId) {
  const carriesMessage = MESSAGE_IN_HELP_RULES.has(ruleId) && diagnostic.help !== undefined;
  return carriesMessage ? `${diagnostic.message} ${diagnostic.help}` : diagnostic.message;
}

function withoutSentinelHint(message) {
  return message.replace(SENTINEL_HINT, '');
}

function byteLocator(bytes) {
  const lineStarts = [hasByteOrderMark(bytes) ? 3 : 0];
  for (const index of bytes.keys()) {
    const breakLength = lineBreakLengthAt(bytes, index);
    if (breakLength > 0) lineStarts.push(index + breakLength);
  }
  return (offset) => {
    const lineIndex = lastLineStartAtOrBefore(lineStarts, offset);
    const prefix = bytes.subarray(lineStarts[lineIndex], offset).toString('utf8');
    return { line: lineIndex + 1, column: prefix.length + 1 };
  };
}

function hasByteOrderMark(bytes) {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function lineBreakLengthAt(bytes, index) {
  if (bytes[index] === 0x0a) return 1;
  if (bytes[index] === 0x0d) return bytes[index + 1] === 0x0a ? 0 : 1;
  const isSeparator =
    bytes[index] === 0xe2 &&
    bytes[index + 1] === 0x80 &&
    (bytes[index + 2] === 0xa8 || bytes[index + 2] === 0xa9);
  return isSeparator ? 3 : 0;
}

function lastLineStartAtOrBefore(lineStarts, offset) {
  return lineStarts.findLastIndex((lineStart) => lineStart <= offset);
}
