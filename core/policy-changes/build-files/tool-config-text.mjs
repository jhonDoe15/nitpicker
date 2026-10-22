import path from 'node:path';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { codeExtensionNames } from '../../../languages/typescript/preset/layout.mjs';

const EDITORCONFIG = '.editorconfig';
const KOTLIN_FILES = ['A.kt', 'A.kts'];
const PRETTIER_FILES = [...codeExtensionNames, 'json', 'yaml', 'yml'].map((name) => `a.${name}`);
const SECTION = /^\[(.*)\]$/u;
const EDITORCONFIG_COMMENT = /^[#;]/u;
const HASH_COMMENT = /^#/u;
const SLASH_COMMENT = /^\/\//u;
const BLOCK_COMMENT = /^\/\*[\s\S]*?\*\//gmu;
const XML_COMMENT = /<!--[\s\S]*?-->/gu;
const HASH_FILES = new Set(['.yml', '.yaml', '.toml']);
const MIXED_FILES = new Set(['.prettierrc', '.prettierignore']);

function keptLines(text, isComment, trimStart = true) {
  return text
    .split(/\r?\n/u)
    .map((line) => (trimStart ? line.trim() : line.trimEnd()))
    .filter((line) => line !== '' && !isComment(line.trim()))
    .join('\n');
}

function sectionApplies(glob, names) {
  if (glob.includes('/')) {
    return true;
  }
  try {
    const matcher = globMatcher(glob);
    return names.some((name) => matcher.test(name));
  } catch {
    return true;
  }
}

function editorconfigText(text, names) {
  const kept = [];
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

function xmlText(text) {
  return text
    .replaceAll(XML_COMMENT, ' ')
    .replaceAll(/\s+/gu, ' ')
    .replaceAll(/>\s+</gu, '><')
    .trim();
}

function scriptText(text) {
  return keptLines(text.replaceAll(BLOCK_COMMENT, ''), (trimmed) => SLASH_COMMENT.test(trimmed));
}

function jsonText(text) {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return undefined;
  }
}

export function toolConfigText(tool, file, text) {
  const name = path.posix.basename(file);
  const extension = path.posix.extname(file);
  const json = extension === '.json' || name === '.prettierrc' ? jsonText(text) : undefined;
  if (json !== undefined) {
    return json;
  }
  if (name === EDITORCONFIG) {
    return editorconfigText(text, tool === 'prettier' ? PRETTIER_FILES : KOTLIN_FILES);
  }
  if (extension === '.xml') {
    return xmlText(text);
  }
  if (HASH_FILES.has(extension)) {
    return keptLines(text, (trimmed) => HASH_COMMENT.test(trimmed), false);
  }
  if (MIXED_FILES.has(name)) {
    return keptLines(text, (trimmed) => HASH_COMMENT.test(trimmed) || SLASH_COMMENT.test(trimmed));
  }
  return scriptText(text);
}
