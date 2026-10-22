const CODE_STRINGS = String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`;
const TOML_STRINGS = String.raw`"(?:\\.|[^"\\\n])*"|'[^'\n]*'`;
const COMMENT_PATTERNS = {
  code: new RegExp(String.raw`(${CODE_STRINGS})|\/\*[\s\S]*?\*\/|\/\/[^\n]*`, 'g'),
  toml: new RegExp(String.raw`(${TOML_STRINGS})|#[^\n]*`, 'g'),
};

export function withoutComments(text, kind) {
  return text.replaceAll(COMMENT_PATTERNS[kind], (whole, string) => string ?? ' ');
}
