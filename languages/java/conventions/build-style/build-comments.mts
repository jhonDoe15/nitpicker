const CODE_STRINGS = String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`;
const TOML_STRINGS = String.raw`"(?:\\.|[^"\\\n])*"|'[^'\n]*'`;
const COMMENT_PATTERNS: Record<'code' | 'toml', RegExp> = {
  code: new RegExp(String.raw`(${CODE_STRINGS})|\/\*[\s\S]*?\*\/|\/\/[^\n]*`, 'g'),
  toml: new RegExp(String.raw`(${TOML_STRINGS})|#[^\n]*`, 'g'),
};

export function withoutComments(text: string, kind: 'code' | 'toml'): string {
  return text.replaceAll(
    COMMENT_PATTERNS[kind],
    (_whole: string, string: string | undefined) => string ?? ' ',
  );
}
