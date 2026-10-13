const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const MODULE_NAME = /(['"])[^'"\n]*\1\)?[ \t]*;?/g;
const IMPORT_HEAD =
  /^[\s;]*(?:import\b[\w$*\s{},]*|import\s+[\w$]+\s*=\s*require\(\s*|(?:const|let|var)\s+[\w$\s{},:]+=\s*require\(\s*)$/;
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
