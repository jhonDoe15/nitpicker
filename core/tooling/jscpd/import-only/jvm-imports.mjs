const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const NAME = /^[\w.$*`]+$/;
const NAME_TAIL = /^[\w.$*`\s]*$/;
const TRAILING_SEMICOLON = /;$/;
const MODIFIERS = String.raw`(?:(?:public|private|protected|internal|abstract|final|open|sealed|non-sealed|data|enum|annotation|static|inline|value|override|suspend|const|lateinit|tailrec|external|default|synchronized|strictfp)\s+)*`;
export const JVM_OVERSHOOT = new RegExp(
  String.raw`^\s*(?:@|/[*/]|${MODIFIERS}(?:class|interface|enum|record|object|fun|typealias|val|var)\b)`,
);
const DECLARATION = /^\s*(?:import|package)\s/m;

function withoutSemicolon(line) {
  return line.trimEnd().replace(TRAILING_SEMICOLON, '');
}

function isDeclarationLine(line) {
  const body = withoutSemicolon(line).trim();
  if (body === '') {
    return line.trim() === '';
  }
  const [keyword, ...names] = body.split(/\s+/);
  return (
    (keyword === 'import' || keyword === 'package') &&
    names.length > 0 &&
    names.every((name) => NAME.test(name))
  );
}

export function jvmImportsOnly(fragment) {
  const text = fragment.replace(COMMENTS, '');
  const [first, ...rest] = text.split('\n');
  return (
    DECLARATION.test(text) &&
    NAME_TAIL.test(withoutSemicolon(first)) &&
    rest.every(isDeclarationLine)
  );
}
