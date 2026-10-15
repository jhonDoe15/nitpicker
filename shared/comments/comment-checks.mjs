const WORK_TAG = /\b(?:TODO|FIXME|XXX|HACK)\b/;
const ISSUE_REFERENCE = /#\d+|\b[A-Z][A-Z0-9]+-\d+\b|https?:\/\/\S+/;
const STATEMENT_KEYWORDS = [
  'if',
  'for',
  'while',
  'switch',
  'try',
  'catch',
  'else',
  'do',
  'return',
  'throw',
  'break',
  'continue',
  'import',
  'export',
  'const',
  'let',
  'var',
  'function',
  'class',
  'interface',
  'enum',
  'public',
  'private',
  'protected',
  'static',
  'final',
  'new',
  'await',
  'async',
  'package',
];
const KEYWORD_START = new RegExp(`^(?:${STATEMENT_KEYWORDS.join('|')}|@\\w+)\\b`);
const STATEMENT_END = /[\w)\]"'`]\s*;$/;
const CALL_OR_ASSIGNMENT = /[(=]/;
const BLOCK_OPEN = /\)\s*\{$|^(?:else|try|do|finally)\s*\{$|^\}\s*(?:else|catch|finally)\b.*\{$/;
const BLOCK_CLOSE = /^\}[)\];,]*$/;
const SENTENCE = /^[A-Z][a-z]+ [a-z]+ [a-z]+/;
const EXAMPLE_TAG = /^@example\b/;
const ANY_TAG = /^@\w+/;
const FENCE = /^(?:```|~~~)/;
const PRE_OPEN = /<pre>/i;
const PRE_CLOSE = /<\/pre>/i;
const INLINE_DOC_TAG = /\{@(?:code|link|snippet|literal)\b/;

export function bodyLines(commentText) {
  return commentText.split('\n').map((line) => line.replace(/^\s*\*+\s?/, '').trim());
}

export function unreferencedWorkTagLines(lines) {
  return lines.flatMap((line, index) =>
    WORK_TAG.test(line) && !ISSUE_REFERENCE.test(line) ? [index] : [],
  );
}

function isStatementLine(text) {
  if (!STATEMENT_END.test(text) || SENTENCE.test(text)) return false;
  return CALL_OR_ASSIGNMENT.test(text) || KEYWORD_START.test(text);
}

function isCodeLine(text) {
  if (text === '' || INLINE_DOC_TAG.test(text)) return false;
  return isStatementLine(text) || BLOCK_OPEN.test(text) || BLOCK_CLOSE.test(text);
}

function exampleMask(lines) {
  const open = { example: false, fence: false, pre: false };
  return lines.map((line) => {
    if (FENCE.test(line)) open.fence = !open.fence;
    if (PRE_OPEN.test(line)) open.pre = true;
    if (EXAMPLE_TAG.test(line)) open.example = true;
    else if (ANY_TAG.test(line)) open.example = false;
    const documented = open.example || open.fence || open.pre;
    if (PRE_CLOSE.test(line)) open.pre = false;
    return documented;
  });
}

export function firstCommentedOutCodeLine(lines) {
  const documentation = exampleMask(lines);
  return lines.findIndex((line, index) => !documentation[index] && isCodeLine(line));
}
