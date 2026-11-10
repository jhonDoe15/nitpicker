const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu;
const IMPORT_PATH = String.raw`(?:[\w.]+\s+)?"[^"\n]*"`;
const DECLARATION_LINE = new RegExp(
  String.raw`^(?:package\s+\w+|import\s+(?:${IMPORT_PATH}|\(\s*(?:${IMPORT_PATH})?)|${IMPORT_PATH}|\))?$`,
  'u',
);
const LINE_TAIL = /^[\w.\s"/()-]*$/u;
const IMPORT_WORD = /^\s*(?:import|package)\s|^\s*(?:[\w.]+\s+)?"[^"\n]*"\s*$/mu;
export const GO_OVERSHOOT = /^\s*(?:\/[*/]|func\b|type\b|var\b|const\b)/u;

export function goImportsOnly(fragment) {
  const text = fragment.replace(COMMENTS, '');
  const [first, ...rest] = text.split('\n');
  return (
    IMPORT_WORD.test(text) &&
    LINE_TAIL.test(first) &&
    rest.every((line) => DECLARATION_LINE.test(line.trim()))
  );
}
