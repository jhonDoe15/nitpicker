import { readFileSync } from 'node:fs';
import path from 'node:path';
import { reportedRuleKey } from './oxlint-translation.mjs';

const SENTINEL_HINT = / Unused [a-z ]+ should match \/\[\^\\s\\S\]\/\./gu;
const IRREGULAR_WHITESPACE_RULE = 'no-irregular-whitespace';
const TSCONFIG_ERROR_CODE = 'typescript(tsconfig-error)';
const REMOVED_OPTION = /Option '([^']+)' has been removed/u;
const MISSING_TYPES = /Cannot find type definition file for '([^']+)'/u;

export function eslintShapedResults(stage, diagnostics, naming) {
  const configErrors = diagnostics.filter((diagnostic) => diagnostic.code === TSCONFIG_ERROR_CODE);
  if (configErrors.length > 0) throw new Error(typeAwareRulesSkipped(configErrors));
  const reported = distinctDiagnostics(diagnostics).filter(
    (diagnostic) => !isIgnoredDiagnostic(diagnostic),
  );
  const byFile = Map.groupBy(reported, (diagnostic) => diagnostic.filename);
  return [...byFile].map(([filename, fileDiagnostics]) => {
    const filePath = filename.replaceAll('\\', '/');
    const locate = byteLocator(readFileSync(path.join(stage, filename)));
    const neutralized = naming.neutralized.get(filePath) ?? new Set();
    return {
      filePath,
      messages: fileDiagnostics
        .map((diagnostic) => eslintMessage(diagnostic, naming, locate))
        .filter((message) => !isNeutralizerWhitespace(message, neutralized)),
    };
  });
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

function typeAwareRulesSkipped(configErrors) {
  const reasons = new Set(configErrors.map((diagnostic) => configErrorReason(diagnostic)));
  return `Type-aware rules cannot run: ${[...reasons].join(' ')}`;
}

function configErrorReason({ message, help }) {
  const text = (help ?? message).split('\n')[0];
  const removed = REMOVED_OPTION.exec(text)?.[1];
  if (removed !== undefined) {
    return `TypeScript 7 removed tsconfig option '${removed}'; remove it from the project tsconfig.`;
  }
  const missingTypes = MISSING_TYPES.exec(text)?.[1];
  return missingTypes === undefined
    ? `TypeScript 7 rejects the lint tsconfig: ${text}`
    : `no type definitions found for '${missingTypes}' in the tsconfig types.`;
}

function isIgnoredDiagnostic(diagnostic) {
  return diagnostic.code === undefined && diagnostic.message.startsWith('Unused oxlint-');
}

function isUnusedEslintDirective(diagnostic) {
  return diagnostic.code === undefined && diagnostic.message.startsWith('Unused eslint-');
}

function eslintMessage(diagnostic, { ruleNames, messageIdOf }, locate) {
  const span = diagnostic.labels?.[0]?.span ?? { offset: 0, length: 0 };
  const start = locate(span.offset);
  const end = locate(span.offset + span.length);
  const key = reportedRuleKey(diagnostic.code);
  const position = {
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
  if (isUnusedEslintDirective(diagnostic)) {
    return { ruleId: undefined, message: diagnostic.message, severity: 1, ...position };
  }
  if (key === undefined) {
    return { fatal: true, message: diagnostic.message, severity: 2, ...position };
  }
  const ruleId = ruleNames.get(key);
  if (ruleId === undefined) {
    throw new Error(
      `oxlint reported ${diagnostic.code}: ${diagnostic.message} ${diagnostic.help ?? ''}`.trim(),
    );
  }
  const message = withoutSentinelHint(diagnostic.message);
  return { ruleId, messageId: messageIdOf(ruleId, message), message, severity: 2, ...position };
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
