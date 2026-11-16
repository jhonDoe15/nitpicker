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
const LIBRARY_BRANCHES = new Map<string, number>([
  ['orEmpty', 2],
  ['isNullOrEmpty', 4],
  ['isNullOrBlank', 4],
]);
const SUSPENSION_CALL = new RegExp(String.raw`\b(${SUSPENSION_NAMES.join('|')})\s*[({]`);
const LIBRARY_CALL = new RegExp(
  String.raw`(?<!\bfun\b[^=(]*)\.\s*(${[...LIBRARY_BRANCHES.keys()].join('|')})\s*\(\s*\)`,
  'g',
);
const BRANCHING_SYNTAX = new RegExp(
  String.raw`\b(?:if|when|while|for|do|is|in|as)\b|&&|\|\||\?[.:]|[<>!]|==|\b(?:${BRANCHING_CALL_NAMES.join('|')})\b`,
);
const STRING_LITERAL = /"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])'/g;
const STRING_TEMPLATE = '${';
const TYPE_ARGUMENTS = /\b<[\w?., *<>]*>/g;
const LINE_COMMENT = /\/\/.*$/;

function codeOf(sourceLine: string): string {
  return sourceLine
    .replaceAll(STRING_LITERAL, '""')
    .replace(LINE_COMMENT, '')
    .replaceAll(TYPE_ARGUMENTS, '')
    .replaceAll('->', ' ');
}

export function suspensionCall(sourceLine: string): string | undefined {
  return SUSPENSION_CALL.exec(codeOf(sourceLine))?.[1];
}

export function libraryCalls(sourceLine: string): string[] {
  return [...codeOf(sourceLine).matchAll(LIBRARY_CALL)].flatMap(([, name]) => name ?? []);
}

export function libraryBranchCount(sourceLine: string): number {
  return libraryCalls(sourceLine).reduce((sum, name) => sum + (LIBRARY_BRANCHES.get(name) ?? 0), 0);
}

export function isCompilerGeneratedBranchLine(sourceLine: string): boolean {
  if (sourceLine.includes(STRING_TEMPLATE)) {
    return false;
  }
  const code = codeOf(sourceLine);
  return SUSPENSION_CALL.test(code) && !BRANCHING_SYNTAX.test(code);
}
