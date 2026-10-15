const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const DECLARATION_LINE = /^\s*(?:(?:import|package)\s+[\w.$*`\s]+?\s*;?)?\s*$/;
const NAME_TAIL = /^[\w.$*`\s]*;?\s*$/;
const MODIFIERS = String.raw`(?:(?:public|private|protected|internal|abstract|final|open|sealed|non-sealed|data|enum|annotation|static|inline|value|override|suspend|const|lateinit|tailrec|external|default|synchronized|strictfp)\s+)*`;
export const JVM_OVERSHOOT = new RegExp(
  String.raw`^\s*(?:@|/[*/]|${MODIFIERS}(?:class|interface|enum|record|object|fun|typealias|val|var)\b)`,
);
const DECLARATION = /^\s*(?:import|package)\s/m;

export function jvmImportsOnly(fragment) {
  const text = fragment.replace(COMMENTS, '');
  const [first, ...rest] = text.split('\n');
  return (
    DECLARATION.test(text) &&
    NAME_TAIL.test(first) &&
    rest.every((line) => DECLARATION_LINE.test(line))
  );
}
