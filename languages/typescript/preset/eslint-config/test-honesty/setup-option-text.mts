import { escapeRegExp as untypedEscapeRegExp } from '../../../../../shared/paths/glob.mts';

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;
const QUOTED = /(['"`])([^'"`]+)\1/gu;
const SCRIPT_PRELOAD =
  /(?:^|[\s"'=])(?:--import|--require|-r|--file|--test-global-setup)(?:=|\s+)(?:(['"])([^'"]+)\1|([^\s'"]+))/gu;
const YAML_FILE = /\.ya?ml$/u;
const YAML_COMMENT = /(^|\s)#.*$/gmu;
const LINE_COMMENT = /^\s*\/\/.*$/gmu;
const BLOCK_COMMENT = /(^|\s)\/\*[\s\S]*?\*\//gu;
const ROOT_DIR_OPTION = /["']?\brootDir["']?[ \t]*:[ \t]*(['"`])([^'"`]+)\1/u;

function optionPattern(keys: readonly string[]): RegExp {
  const value = String.raw`(\[[^\]]*\]|(['"\x60])[^'"\x60\n]+\2|[^\s,'"\x60\[\]{}#]+(?:\s*\n(?:\s*-\s*[^\n]+\n?)+)?|\s*\n(?:\s*-\s*[^\n]+\n?)+)`;
  return new RegExp(
    String.raw`["']?\b(?:${keys.map(escapeRegExp).join('|')})["']?[ \t]*:[ \t]*${value}`,
    'gu',
  );
}

function entriesOf(value: string): string[] {
  const quoted = [...value.matchAll(QUOTED)].flatMap((match) =>
    match[2] === undefined ? [] : [match[2]],
  );
  if (quoted.length > 0) {
    return quoted;
  }
  return value
    .replace(/^\s*\[|\]\s*$/gu, '')
    .split(/[\n,]/u)
    .map((line: string) => line.replace(/^\s*-\s*/u, '').trim())
    .filter((line: string) => line !== '');
}

export function withoutComments(text: string, file: string): string {
  if (YAML_FILE.test(file)) {
    return text.replace(YAML_COMMENT, '$1');
  }
  return text.replace(BLOCK_COMMENT, '$1').replace(LINE_COMMENT, '');
}

export function optionEntries(text: string, keys: readonly string[]): string[] {
  return [...text.matchAll(optionPattern(keys))].flatMap(([, value]) => entriesOf(value ?? ''));
}

export function rootDirIn(text: string): string | undefined {
  return ROOT_DIR_OPTION.exec(text)?.[2];
}

export function scriptPreloads(command: string): string[] {
  return [...command.matchAll(SCRIPT_PRELOAD)].flatMap((match) => {
    const preload = match[2] ?? match[3];
    return preload === undefined ? [] : [preload];
  });
}
