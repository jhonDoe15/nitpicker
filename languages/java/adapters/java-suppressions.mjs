import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { hash, nextOccurrence } from '../../../shared/rules/finding-helpers.mjs';

export const INLINE_SUPPRESSION_RULE = 'InlineSuppression';
export const INLINE_SUPPRESSIBLE_RULES = ['PMD.SpringDataNativeQuery'];

const SUPPRESS_WARNINGS = /@(?:java\.lang\.)?SuppressWarnings\s*\(([^)]*)\)/g;
const STRING_LITERAL = /"((?:[^"\\]|\\.)*)"/g;
const NOPMD_COMMENT = /\/[/*][^\n]*?\bNOPMD\b/g;
const MESSAGE =
  'Do not silence PMD inline. Fix the finding, or lift the rule for these paths with an exception in nitpicker.config.json, where it shows in review. The one inline marker nitpicker accepts is @SuppressWarnings("PMD.SpringDataNativeQuery") on a repository method that needs native SQL.';

export function readInlineSuppressionFindings(projectRoot, sourceRoots) {
  return sourceRoots.flatMap((sourceRoot) =>
    javaFiles(path.join(projectRoot, sourceRoot)).flatMap((file) =>
      fileFindings(
        readFileSync(file, 'utf8'),
        path.relative(projectRoot, file).split(path.sep).join('/'),
      ),
    ),
  );
}

function javaFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

export function fileFindings(source, filePath) {
  const occurrences = new Map();
  const suppressions = [
    ...[...source.matchAll(SUPPRESS_WARNINGS)].flatMap((match) => {
      const values = [...match[1].matchAll(STRING_LITERAL)].map(([, value]) => value);
      const silencesPmd = values.filter((value) => value === 'all' || /^PMD(?:\.|$)/.test(value));
      return silencesPmd.length === 0 || isAcceptedMarker(silencesPmd, source, match)
        ? []
        : [{ offset: match.index, found: silencesPmd.map((value) => `"${value}"`).join(', ') }];
    }),
    ...[...source.matchAll(NOPMD_COMMENT)].map((match) => ({
      offset: match.index,
      found: 'NOPMD',
    })),
  ].sort((left, right) => left.offset - right.offset);
  return suppressions.map(({ offset, found }) => {
    const key = `${found}\0${declarationAfter(source, offset)}\0${lineText(source, offset)}`;
    const occurrence = nextOccurrence(occurrences, key);
    return {
      tool: 'pmd',
      rule: INLINE_SUPPRESSION_RULE,
      path: filePath,
      identity: `${INLINE_SUPPRESSION_RULE}:${hash(key)}${occurrence === 1 ? '' : `#${String(occurrence)}`}`,
      message: `${MESSAGE} Found: ${found}.`,
      classification: 'enforceable',
      location: { line: lineOf(source, offset) },
    };
  });
}

function lineText(source, offset) {
  const start = source.lastIndexOf('\n', offset) + 1;
  const end = source.indexOf('\n', offset);
  return source.slice(start, end === -1 ? undefined : end).trim();
}

function isAcceptedMarker(silencesPmd, source, match) {
  return (
    silencesPmd.every((value) => INLINE_SUPPRESSIBLE_RULES.includes(value)) &&
    isMethodDeclaration(declarationAfter(source, match.index + match[0].length))
  );
}

function declarationAfter(source, offset) {
  return headerUntilBody(source.slice(offset))
    .replace(/@[\w.]+(?:\s*\((?:[^()"]|"(?:[^"\\]|\\.)*")*\))?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerUntilBody(rest) {
  let quote = '';
  for (let index = 0; index < rest.length; index += 1) {
    const character = rest[index];
    if (quote !== '') {
      if (character === '\\') {
        index += 1;
      } else if (rest.startsWith(quote, index)) {
        index += quote.length - 1;
        quote = '';
      }
    } else if (rest.startsWith('"""', index)) {
      quote = '"""';
      index += 2;
    } else if (character === '"') {
      quote = '"';
    } else if (character === '{' || character === ';') {
      return rest.slice(0, index);
    }
  }
  return rest;
}

function isMethodDeclaration(declaration) {
  return (
    declaration.includes('(') &&
    !/\b(?:class|interface|record|enum)\b/.test(declaration.slice(0, declaration.indexOf('(')))
  );
}

function lineOf(source, offset) {
  return source.slice(0, offset).split('\n').length;
}
