import { isSupportSecurityFinding } from './test-support.mjs';

const ALLOWED_NUMBERS = new Set([-1, 0, 1, 2, 10, 100, 1000]);
const MAGIC_VALUE_RULE = 'PLR2004';
const MAGIC_VALUE = /replacing `([^`]+)` with a constant/;
const SHELL_RULES = new Set(['S602', 'S604', 'S605']);
const FIXED_COMMAND = /seems safe, but may be changed in the future/;
const TEST_FILE_NOISE = /^(?:ARG|FBT|PLR2004|S\d)/u;
const COMMENT_LABEL = /^\s*#+\s*(?:[A-Z][A-Za-z]*(?: [A-Za-z]+){0,2}:\s+\S|e\.g\.|i\.e\.)/u;
const COMMENTED_CODE_RULE = 'ERA001';
const HASH_CLASS_RULE = 'S303';
const HMAC_CALLEE = /\bHMAC\s*$/u;
const LINES_BEFORE = 8;
const PAREN_DEPTH = { ')': 1, '(': -1 };

function isAllowedNumber(message) {
  const text = MAGIC_VALUE.exec(message)?.[1];
  return text !== undefined && ALLOWED_NUMBERS.has(Number(text.replaceAll('_', '')));
}

function isLabelComment({ rule, path, location }, lineOf) {
  if (rule !== COMMENTED_CODE_RULE || location?.line === undefined) {
    return false;
  }
  return COMMENT_LABEL.test(lineOf(path, location.line) ?? '');
}

function textBefore({ path, location }, lineOf) {
  const first = Math.max(1, location.line - LINES_BEFORE);
  const lines = Array.from(
    { length: location.line - first },
    (_, offset) => lineOf(path, first + offset) ?? '',
  );
  const current = lineOf(path, location.line) ?? '';
  return [...lines, current.slice(0, Math.max(0, (location.column ?? 1) - 1))].join('\n');
}

function enclosingCallee(text) {
  const characters = text.split('').reverse();
  let depth = 0;
  for (const [offset, character] of characters.entries()) {
    depth += PAREN_DEPTH[character] ?? 0;
    if (depth < 0) {
      return text.slice(0, text.length - 1 - offset);
    }
  }
  return undefined;
}

function isHmacHash(finding, lineOf) {
  if (finding.rule !== HASH_CLASS_RULE || finding.location?.line === undefined) {
    return false;
  }
  const callee = enclosingCallee(textBefore(finding, lineOf));
  return callee !== undefined && HMAC_CALLEE.test(callee);
}

function isAllowedForm(finding, { testFiles, lineOf }) {
  const { rule, message, path } = finding;
  if (testFiles.has(path) && TEST_FILE_NOISE.test(rule)) {
    return true;
  }
  if (isSupportSecurityFinding(finding) || isHmacHash(finding, lineOf)) {
    return true;
  }
  if (isLabelComment(finding, lineOf)) {
    return true;
  }
  if (rule === MAGIC_VALUE_RULE) {
    return isAllowedNumber(message);
  }
  return SHELL_RULES.has(rule) && FIXED_COMMAND.test(message);
}

export function withoutAllowedForms(findings, { testFiles = [], lineOf = () => undefined } = {}) {
  const context = { testFiles: new Set(testFiles), lineOf };
  return findings.filter((finding) => finding.tool !== 'ruff' || !isAllowedForm(finding, context));
}
