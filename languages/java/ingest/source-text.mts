export const LITERAL_OR_COMMENT =
  /"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

export function blanked(source: string): string {
  return source.replace(LITERAL_OR_COMMENT, (match: string) => match.replaceAll(/[^\n]/g, ' '));
}
