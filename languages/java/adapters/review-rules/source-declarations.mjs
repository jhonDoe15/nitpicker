import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blankLiterals, packageOf, pathInside, sourceFilesUnder } from './java-sources.mjs';

const SOURCE_EXTENSIONS = ['.java', '.kt'];
const DECLARATION =
  /\b(?:class|interface|enum|record|object)\s+(?!(?:class|interface)\b)([A-Za-z_$][\w$]*)/gu;
const KOTLIN_MODIFIERS =
  'public|internal|private|inline|suspend|operator|infix|tailrec|external|actual|expect|const|lateinit';
const TOP_LEVEL_MEMBER = new RegExp(
  String.raw`^[ \t]*(?:@[\w.:]+(?:\([^)\n]*\))?\s+)*(?:(?:${KOTLIN_MODIFIERS})\s+)*(fun|val|var)\b`,
  'gmu',
);
const JAVA_MAIN = /\bstatic\s+(?:final\s+)?void\s+main\s*\(/u;
const KOTLIN_STATIC_MAIN = /@JvmStatic\s+(?:\w+\s+)*fun\s+main\s*\(/u;
const KOTLIN_MAIN = /^fun\s+main\s*\(/u;
const JVM_NAME = /@file\s*:\s*JvmName\(\s*"([^"]+)"\s*\)/u;
const OPENING = new Set(['{', '(']);
const CLOSING = new Set(['}', ')']);

function depthsOf(text) {
  const depths = new Int32Array(text.length + 1);
  for (let index = 0; index < text.length; index += 1) {
    const change = (OPENING.has(text[index]) ? 1 : 0) - (CLOSING.has(text[index]) ? 1 : 0);
    depths[index + 1] = depths[index] + change;
  }
  return depths;
}

function bodyOf(text, depths, start) {
  const depth = depths[start];
  const open = depths.findIndex(
    (value, index) => index >= start && value === depth && text[index] === '{',
  );
  if (open < 0) {
    return '';
  }
  const close = depths.findIndex((value, index) => index > open && value === depth);
  return text.slice(open, close < 0 ? text.length : close);
}

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function facadeName(file, raw) {
  const named = JVM_NAME.exec(raw)?.[1];
  if (named !== undefined) {
    return named;
  }
  const base = path.basename(file, '.kt').replaceAll(/[^\w$]/gu, '_');
  return `${base.charAt(0).toUpperCase()}${base.slice(1)}Kt`;
}

function keywordIndex(match) {
  return match.index + match[0].length - match[1].length;
}

function facadeOf(file, raw, { text, depths, qualify }) {
  const members = [...text.matchAll(TOP_LEVEL_MEMBER)].filter(
    (match) => depths[keywordIndex(match)] === 0,
  );
  if (members.length === 0) {
    return [];
  }
  const entryPoint = members.some((match) => KOTLIN_MAIN.test(text.slice(keywordIndex(match))));
  const line = lineAt(text, keywordIndex(members[0]));
  return [[qualify(facadeName(file, raw)), { line, entryPoint }]];
}

function declarationsIn(file) {
  const raw = readFileSync(file, 'utf8');
  const text = blankLiterals(raw);
  const depths = depthsOf(text);
  const packageName = packageOf(text);
  const qualify = (name) => (packageName === '' ? name : `${packageName}.${name}`);
  const kotlin = file.endsWith('.kt');
  const mainPattern = kotlin ? KOTLIN_STATIC_MAIN : JAVA_MAIN;
  const classes = [...text.matchAll(DECLARATION)]
    .filter((match) => depths[match.index] === 0)
    .map((match) => [
      qualify(match[1]),
      {
        line: lineAt(text, match.index),
        entryPoint: mainPattern.test(bodyOf(text, depths, match.index)),
      },
    ]);
  return [...classes, ...(kotlin ? facadeOf(file, raw, { text, depths, qualify }) : [])];
}

export function readDeclarations(projectRoot, roots) {
  const declarations = new Map();
  const files = [...new Set(roots)].flatMap((root) =>
    sourceFilesUnder(pathInside(projectRoot, root), SOURCE_EXTENSIONS),
  );
  for (const file of files) {
    const relative = path.relative(projectRoot, file).replaceAll('\\', '/');
    for (const [className, declared] of declarationsIn(file)) {
      if (!declarations.has(className)) {
        declarations.set(className, { ...declared, file: relative });
      }
    }
  }
  return declarations;
}
