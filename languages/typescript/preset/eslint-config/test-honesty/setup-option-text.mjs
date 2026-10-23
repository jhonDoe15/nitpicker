const QUOTED = /(['"`])([^'"`]+)\1/gu;
const SCRIPT_PRELOAD =
  /(?:^|[\s"'=])(?:--import|--require|-r|--file|--test-global-setup)(?:=|\s+)(?:(['"])([^'"]+)\1|([^\s'"]+))/gu;
const YAML_FILE = /\.ya?ml$/u;
const YAML_COMMENT = /(^|\s)#.*$/gmu;
const LINE_COMMENT = /^\s*\/\/.*$/gmu;
const BLOCK_COMMENT = /(^|\s)\/\*[\s\S]*?\*\//gu;
const ROOT_DIR_OPTION = /["']?\brootDir["']?[ \t]*:[ \t]*(['"`])([^'"`]+)\1/u;

function optionPattern(keys) {
  const value = String.raw`(\[[^\]]*\]|(['"\x60])[^'"\x60\n]+\2|[^\s,'"\x60\[\]{}#]+(?:\s*\n(?:\s*-\s*[^\n]+\n?)+)?|\s*\n(?:\s*-\s*[^\n]+\n?)+)`;
  return new RegExp(String.raw`["']?\b(?:${keys.join('|')})["']?[ \t]*:[ \t]*${value}`, 'gu');
}

function entriesOf(value) {
  const quoted = [...value.matchAll(QUOTED)].map((match) => match[2]);
  if (quoted.length > 0) {
    return quoted;
  }
  return value
    .replace(/^\s*\[|\]\s*$/gu, '')
    .split(/[\n,]/u)
    .map((line) => line.replace(/^\s*-\s*/u, '').trim())
    .filter((line) => line !== '');
}

export function withoutComments(text, file) {
  if (YAML_FILE.test(file)) {
    return text.replace(YAML_COMMENT, '$1');
  }
  return text.replace(BLOCK_COMMENT, '$1').replace(LINE_COMMENT, '');
}

export function optionEntries(text, keys) {
  return [...text.matchAll(optionPattern(keys))].flatMap(([, value]) => entriesOf(value));
}

export function rootDirIn(text) {
  return ROOT_DIR_OPTION.exec(text)?.[2];
}

export function scriptPreloads(command) {
  return [...command.matchAll(SCRIPT_PRELOAD)].map((match) => match[2] ?? match[3]);
}
