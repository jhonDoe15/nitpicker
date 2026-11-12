export const LITERAL_OR_COMMENT =
  /"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

export function blanked(source) {
  return source.replace(LITERAL_OR_COMMENT, (match) => match.replaceAll(/[^\n]/g, ' '));
}
