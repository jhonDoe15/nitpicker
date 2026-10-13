const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const DECLARATION_LINE = /^\s*(?:(?:import|package)\s+[\w.$*`\s]+?\s*;?)?\s*$/;
const NAME_TAIL = /^[\w.$*`\s]*;?\s*$/;
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
