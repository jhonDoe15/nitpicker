const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const MODULE_NAME = /(['"])[^'"\n]*\1\)?[ \t]*;?/g;
const IMPORT_FORMS = [
  String.raw`import\b[\w$*\s{},]*`,
  String.raw`export\b[\w$*\s{},]*\bfrom\s*`,
  String.raw`import\s+[\w$]+\s*=\s*require\(\s*`,
  String.raw`(?:const|let|var)\s[\w$\s{},:]*=\s*require\(\s*`,
];
const IMPORT_HEAD = new RegExp(String.raw`^[\s;]*(?:${IMPORT_FORMS.join('|')})$`);
export const SCRIPT_OVERSHOOT =
  /^\s*(?:@\w|\/[*/]|(?:export|declare|abstract|async|function|class|interface|type|enum|namespace|const|let|var)\b)/;
const IMPORT_REST = /^[\s;}]*$|\bfrom\s*$/;

export function scriptImportsOnly(fragment) {
  const text = fragment.replace(COMMENTS, '');
  const statements = [];
  let end = 0;
  for (const name of text.matchAll(MODULE_NAME)) {
    statements.push(text.slice(end, name.index));
    end = name.index + name[0].length;
  }
  const tail = text.slice(end);
  const [first, ...others] = statements;
  return (
    (first === undefined || IMPORT_HEAD.test(first) || IMPORT_REST.test(first)) &&
    others.every((statement) => IMPORT_HEAD.test(statement)) &&
    (tail.trim() === '' || IMPORT_HEAD.test(tail))
  );
}
