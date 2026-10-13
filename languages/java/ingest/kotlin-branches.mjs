const SUSPENSION_CALL =
  /\b(emit|emitAll|yield|yieldAll|delay|await|awaitAll|withContext|withTimeout|withTimeoutOrNull|coroutineScope|supervisorScope|flow|channelFlow|callbackFlow|sequence)\s*[({]/;
const BRANCHING_SYNTAX =
  /\b(?:if|when|while|for|do|is|in|as)\b|&&|\|\||\?[.:]|[<>!]|==|\b(?:require|check|assert|requireNotNull|checkNotNull|takeIf|takeUnless|ifEmpty|ifBlank|orEmpty|getOrElse|maxOf|minOf|coerceAtLeast|coerceAtMost|coerceIn)\b/;
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

export function isCompilerGeneratedBranchLine(sourceLine) {
  if (sourceLine.includes(STRING_TEMPLATE)) {
    return false;
  }
  const code = codeOf(sourceLine);
  return SUSPENSION_CALL.test(code) && !BRANCHING_SYNTAX.test(code);
}
