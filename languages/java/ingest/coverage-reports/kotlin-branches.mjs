const SUSPENSION_NAMES = [
  'emit',
  'emitAll',
  'yield',
  'yieldAll',
  'delay',
  'await',
  'awaitAll',
  'withContext',
  'withTimeout',
  'withTimeoutOrNull',
  'coroutineScope',
  'supervisorScope',
  'flow',
  'channelFlow',
  'callbackFlow',
  'sequence',
];
const BRANCHING_CALL_NAMES = [
  'require',
  'check',
  'assert',
  'requireNotNull',
  'checkNotNull',
  'takeIf',
  'takeUnless',
  'ifEmpty',
  'ifBlank',
  'getOrElse',
  'coerceAtLeast',
  'coerceAtMost',
  'coerceIn',
];
const LIBRARY_BRANCH_NAMES = ['orEmpty', 'isNullOrEmpty', 'isNullOrBlank', 'maxOf', 'minOf'];
const SUSPENSION_CALL = new RegExp(String.raw`\b(${SUSPENSION_NAMES.join('|')})\s*[({]`);
const LIBRARY_BRANCH_CALL = new RegExp(String.raw`\b(${LIBRARY_BRANCH_NAMES.join('|')})\s*\(`, 'g');
const BRANCHING_SYNTAX = new RegExp(
  String.raw`\b(?:if|when|while|for|do|is|in|as)\b|&&|\|\||\?[.:]|[<>!]|==|\b(?:${BRANCHING_CALL_NAMES.join('|')})\b`,
);
const STRING_LITERAL = /"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])'/g;
const STRING_TEMPLATE = '${';
const TYPE_ARGUMENTS = /(?<=\w)<[\w?., *<>]*>/g;
const LINE_COMMENT = /\/\/.*$/;

function codeOf(sourceLine) {
  return sourceLine
    .replaceAll(STRING_LITERAL, '""')
    .replace(LINE_COMMENT, '')
    .replaceAll(TYPE_ARGUMENTS, '')
    .replaceAll('->', ' ');
}

export function suspensionCall(sourceLine) {
  return SUSPENSION_CALL.exec(codeOf(sourceLine))?.[1];
}

export function libraryBranchCall(sourceLine) {
  return [...codeOf(sourceLine).matchAll(LIBRARY_BRANCH_CALL)][0]?.[1];
}

export function isCompilerGeneratedBranchLine(sourceLine) {
  if (sourceLine.includes(STRING_TEMPLATE)) {
    return false;
  }
  const code = codeOf(sourceLine);
  const own = code.replaceAll(LIBRARY_BRANCH_CALL, '(');
  return (SUSPENSION_CALL.test(code) || own !== code) && !BRANCHING_SYNTAX.test(own);
}
