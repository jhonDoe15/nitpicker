const TASK_MARKER = /(?<![\w./-])(?:TODO|FIXME|XXX|HACK)(?![\w-])(?![./]\w)/g;
const MARKER_FOLLOWER = /^[:(]/;
const REFERENCE = '#\\d+|[A-Z][A-Z0-9]+-\\d+|https?:\\/\\/\\S+';
const DIRECT_REFERENCE = new RegExp(`^(?:\\(\\s*(${REFERENCE})\\s*\\)|:?\\s+(${REFERENCE}))`);
const NOT_ISSUE_KEYS = new Set([
  'SHA',
  'UTF',
  'ISO',
  'RFC',
  'MD',
  'AES',
  'RSA',
  'TLS',
  'SSL',
  'HTTP',
  'ES',
  'ECMA',
  'IEEE',
  'CVE',
]);
const JAVA_TYPE =
  '(?:[A-Z]\\w*(?:<[^>]*>)?(?:\\[\\])?|int|long|double|float|boolean|char|byte|short)';
const MODIFIERS = 'public|private|protected|static|final|abstract|synchronized';
const CODE_SHAPES = [
  new RegExp(
    `^(?:(?:const|let|var|final|${JAVA_TYPE})\\s+)*[\\w$.[\\]]+\\s*[-+*/%]?=\\s*[^=\\s].*;$`,
  ),
  /^(?:await\s+|new\s+)?[\w$]+(?:\.[\w$]+)*(?:<[^>]*>)?\(.*\)(?:\.[\w$]+\(.*\))*\s*;$/,
  /^(?:return|throw)\b.*;$|^(?:break|continue);$/,
  /^[\w$.]+(?:\+\+|--);$/,
  /^(?:import|package)\s[\w.*{}, ]+(?:\sfrom\s['"][^'"]+['"])?;$/,
  /^(?:\}\s*)?(?:if|for|while|switch|catch|else\s+if)\s*\(.*\)\s*\{$/,
  /^(?:\}\s*)?(?:else|try|do|finally)\s*\{$/,
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b.*\)\s*\{$/,
  new RegExp(
    `^(?:(?:${MODIFIERS})\\s)+[\\w<>[\\],]+(?: [\\w<>[\\],]+)* \\w+ ?\\(.*\\) ?(?:throws [\\w., ]+)?\\{$`,
  ),
  /^(?:export\s+)?(?:abstract\s+)?(?:class|interface|enum|record)\s+\w.*\{$/,
];
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

function tagPositions(line) {
  return [...line.matchAll(TASK_MARKER)]
    .map((match) => ({ start: match.index, end: match.index + match[0].length }))
    .filter(({ start, end }) => start === 0 || MARKER_FOLLOWER.test(line.slice(end)))
    .map(({ end }) => end);
}

function isReferenced(rest) {
  const match = DIRECT_REFERENCE.exec(rest);
  const reference = match?.[1] ?? match?.[2];
  return reference !== undefined && !NOT_ISSUE_KEYS.has(reference.split('-')[0]);
}

export function unreferencedWorkTagLines(lines) {
  return lines.flatMap((line, index) =>
    tagPositions(line).some((end) => !isReferenced(line.slice(end))) ? [index] : [],
  );
}

function isCodeLine(text) {
  if (text === '' || INLINE_DOC_TAG.test(text) || SENTENCE.test(text)) {
    return false;
  }
  return CODE_SHAPES.some((shape) => shape.test(text));
}

function exampleMask(lines) {
  const open = { example: false, fence: false, pre: false };
  return lines.map((line) => {
    if (FENCE.test(line)) {
      open.fence = !open.fence;
    }
    if (PRE_OPEN.test(line)) {
      open.pre = true;
    }
    if (EXAMPLE_TAG.test(line)) {
      open.example = true;
    } else if (ANY_TAG.test(line)) {
      open.example = false;
    }
    const documented = open.example || open.fence || open.pre;
    if (PRE_CLOSE.test(line)) {
      open.pre = false;
    }
    return documented;
  });
}

export function firstCommentedOutCodeLine(lines) {
  const documentation = exampleMask(lines);
  return lines.findIndex((line, index) => !documentation[index] && isCodeLine(line));
}
