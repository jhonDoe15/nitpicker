import { createRequire } from 'node:module';
import path from 'node:path';
import { codeExtensionNames } from '../../../languages/typescript/preset/layout.mjs';
import { parseJsonc as untypedParseJsonc } from '../../../shared/jsonc/jsonc.mjs';
import { selectTypeScriptApi } from '../../../languages/typescript/typescript-api/api-selection.mjs';
import { isTypeScriptApi } from '../../../shared/values/typescript-guard.mts';
import { parseJson, textOf } from '../../../shared/values/readers.mts';
import { globMatcher } from '../types/typed-views.mts';

type JsonText =
  { readonly kind: 'json'; readonly text: string } | { readonly kind: 'malformed-json' };

const parseJsonc: (text: string) => unknown = untypedParseJsonc;
const SCRIPT_FILE_NAMES: readonly string[] = codeExtensionNames;

const EDITORCONFIG = '.editorconfig';
const KOTLIN_FILES = ['A.kt', 'A.kts'];
const PRETTIER_FILES = [...SCRIPT_FILE_NAMES, 'json', 'yaml', 'yml'].map((name) => `a.${name}`);
const SECTION = /^\[(.*)\]$/u;
const EDITORCONFIG_COMMENT = /^[#;]/u;
const HASH_COMMENT = /^#/u;
const SLASH_COMMENT = /^\/\//u;
const BLOCK_COMMENT = /^\/\*[\s\S]*?\*\//gmu;
const XML_COMMENT = /<!--[\s\S]*?-->/gu;
const HASH_FILES = new Set(['.yml', '.yaml', '.toml']);
const MIXED_FILES = new Set(['.prettierrc', '.prettierignore']);
const IGNORE_FILE = /^\.\w*ignore$/u;
const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);

function keptLines(text: string, isComment: (line: string) => boolean, trimStart = true): string {
  return text
    .split(/\r?\n/u)
    .map((line) => (trimStart ? line.trim() : line.trimEnd()))
    .filter((line) => line !== '' && !isComment(line.trim()))
    .join('\n');
}

function closesBraces(glob: string): boolean {
  let depth = 0;
  for (const character of glob) {
    depth += ({ '{': 1, '}': -1 } as const)[character] ?? 0;
    if (depth < 0) {
      return false;
    }
  }
  return depth === 0;
}

function sectionApplies(glob: string, names: readonly string[]): boolean {
  if (glob.includes('/') || !closesBraces(glob)) {
    return true;
  }
  const matcher = globMatcher(glob);
  return names.some((name) => matcher.test(name));
}

function editorconfigText(text: string, names: readonly string[]): string {
  const kept: string[] = [];
  let applies = true;
  for (const line of keptLines(text, (trimmed) => EDITORCONFIG_COMMENT.test(trimmed)).split('\n')) {
    const glob = SECTION.exec(line)?.[1];
    applies = glob === undefined ? applies : sectionApplies(glob, names);
    if (applies) {
      kept.push(line.replaceAll(/\s*=\s*/gu, '='));
    }
  }
  return kept.join('\n');
}

function xmlText(text: string): string {
  return text
    .replaceAll(XML_COMMENT, ' ')
    .replaceAll(/\s+/gu, ' ')
    .replaceAll(/>\s+</gu, '><')
    .trim();
}

function scriptText(text: string): string {
  return keptLines(text.replaceAll(BLOCK_COMMENT, ''), (trimmed) => SLASH_COMMENT.test(trimmed));
}

function printedScript(file: string, text: string): string {
  const ts: unknown = createRequire(import.meta.url)(textOf(selectTypeScriptApi().file));
  if (!isTypeScriptApi(ts)) {
    throw new TypeError('The selected TypeScript API does not load');
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  return ts.createPrinter({ removeComments: true }).printFile(source);
}

function jsonText(text: string, parse: (text: string) => unknown): JsonText {
  try {
    return { kind: 'json', text: JSON.stringify(parse(text)) };
  } catch {
    return { kind: 'malformed-json' };
  }
}

export function toolConfigText(tool: string, file: string, text: string): string {
  const name = path.posix.basename(file);
  const extension = path.posix.extname(file);
  const parse = tool === 'typescript' ? parseJsonc : parseJson;
  const json = extension === '.json' || name === '.prettierrc' ? jsonText(text, parse) : undefined;
  if (json?.kind === 'json') {
    return json.text;
  }
  if (name === EDITORCONFIG) {
    return editorconfigText(text, tool === 'prettier' ? PRETTIER_FILES : KOTLIN_FILES);
  }
  if (extension === '.xml') {
    return xmlText(text);
  }
  if (SCRIPT_EXTENSIONS.has(extension)) {
    return printedScript(file, text);
  }
  return lineCommentText(name, extension, text);
}

function lineCommentText(name: string, extension: string, text: string): string {
  if (HASH_FILES.has(extension) || (IGNORE_FILE.test(name) && !MIXED_FILES.has(name))) {
    return keptLines(text, (trimmed) => HASH_COMMENT.test(trimmed), false);
  }
  if (MIXED_FILES.has(name)) {
    return keptLines(text, (trimmed) => HASH_COMMENT.test(trimmed) || SLASH_COMMENT.test(trimmed));
  }
  return scriptText(text);
}
