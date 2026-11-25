const NOT_CONTROL = String.raw`(?!(?:else|if|for|while|switch|catch|try|do|synchronized|new|return|throw)\b)`;
const MODIFIERS = String.raw`(?:(?:public|protected|private|static|final|abstract|synchronized)\s+)*`;
const BOILERPLATE_LINES = [
  /^[{}]*$/,
  /^@\w+(?:\(.*\))?$/,
  new RegExp(
    String.raw`^${NOT_CONTROL}${MODIFIERS}(?:[\w<>\[\],.?]+\s+)+\w+\s*\([^)]*\)\s*(?:throws [\w., ]*[\w.,]\s*)?\{$`,
  ),
  new RegExp(String.raw`^${NOT_CONTROL}${MODIFIERS}[A-Z]\w*\s*\([^)]*\)\s*\{$`),
  new RegExp(String.raw`^${MODIFIERS}(?:class|interface|record|enum)\s+\w.*\{$`),
  /^return\s+(?:this\.)?\w+;$/,
  /^(?:this\.)?\w+\s*=\s*\w+;$/,
  new RegExp(String.raw`^${NOT_CONTROL}${MODIFIERS}(?:[\w<>\[\],.?]+\s+)+\w+;$`),
];

const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const DATA_LINES = [
  /^[A-Z][A-Z0-9_]*(?:\(.*\))?[,;]?$/,
  /^(?:Arguments\.)?(?:of|arguments)\(.*\)[,;]*$/,
  /^(?=.*\d)(?![\w.]+\()[\w.]*(?:[\s,;{}()[\]+-][\s\d.,;{}()[\]+-]*)?$/,
  /^[\s,;{}()[\]]+$/,
  /^(?:Map\.)?entry\([\w\s.,+-]*\)[,;)]*$/,
  new RegExp(
    String.raw`^(?:[\w<>,.?[\]]+\s+)+\w+\s*=\s*` +
      String.raw`(?:Map\.ofEntries|Map\.of|List\.of|Set\.of|Stream\.of|Arrays\.asList)\([\w\s.,()+-]*$`,
  ),
];

function codeLines(fragment: string): string[] {
  return fragment
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export function isAccessorOnly(fragment: string): boolean {
  return codeLines(fragment).every((line) =>
    BOILERPLATE_LINES.some((pattern) => pattern.test(line)),
  );
}

export function isDataTable(fragment: string): boolean {
  return codeLines(fragment).every((line) => {
    const withoutStrings = line.replace(STRING_LITERAL, '0');
    return [...BOILERPLATE_LINES, ...DATA_LINES].some((pattern) => pattern.test(withoutStrings));
  });
}
