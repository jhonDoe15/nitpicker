import { readFileSync } from 'node:fs';
import {
  blankLiterals,
  pathInside,
  sourceFilesUnder,
} from '../../../review-rules/java-sources.mjs';
import { escapeRegExp } from '../../../../../../shared/paths/glob.mjs';
import { fieldRelation } from '../fetch-paths.mjs';

const CLASS = /\bclass\s+([\w$]+)/gu;
const EXTENDS = /\bextends\s+([\w$.]+)/u;
const ANGLES = { '<': 1, '>': -1 };
const ENTITY_NAME = /@\s*(?:[\w.]*\.)?Entity\s*\(\s*(?:name\s*=\s*)?"([^"]+)"/u;
const ANNOTATION_CALL = /@\s*[\w$.]+\s*\([^()]*\)/gu;
const ANNOTATION = /@\s*([\w$.]+)/gu;
const MODIFIERS = /\b(?:private|protected|public|static|final|transient|volatile)\b/gu;
const BOUNDARY = /[;{}]/gu;
const STEP = { '{': 1, '}': -1 };
const PARENS = { '(': 1, ')': -1 };
const NESTING_PASSES = [0, 1, 2];
const MAX_SUPERCLASSES = 4;

function depthsOf(text, step) {
  const depths = new Int32Array(text.length + 1);
  for (const [index, character] of text.split('').entries()) {
    depths[index + 1] = depths[index] + (step[character] ?? 0);
  }
  return depths;
}

function closingBrace(depths, open) {
  const close = depths.findIndex((depth, index) => index > open && depth === depths[open]);
  return close < 0 ? depths.length : close;
}

function lastBoundary(text, parens, end) {
  const found = [...text.slice(0, end).matchAll(BOUNDARY)]
    .filter(({ index }) => parens[index] === 0)
    .at(-1);
  return found === undefined ? 0 : found.index + 1;
}

function headerOf(text, from) {
  let depth = 0;
  let header = '';
  for (const [offset, character] of [...text.slice(from)].entries()) {
    if (depth === 0 && (character === '{' || character === ';')) {
      return { header, open: character === '{' ? from + offset : -1 };
    }
    depth += ANGLES[character] ?? 0;
    header += depth === 0 && character !== '>' ? character : ' ';
  }
  return { header, open: -1 };
}

function declarationsIn(file) {
  const raw = readFileSync(file, 'utf8');
  const text = blankLiterals(raw);
  const depths = depthsOf(text, STEP);
  const parens = depthsOf(text, PARENS);
  return [...text.matchAll(CLASS)].flatMap((match) => {
    const { header, open } = headerOf(text, match.index + match[0].length);
    if (open < 0) {
      return [];
    }
    const annotations = raw.slice(lastBoundary(text, parens, match.index), match.index);
    return [
      {
        name: match[1],
        entityName: ENTITY_NAME.exec(annotations)?.[1],
        superclass: EXTENDS.exec(header)?.[1].split('.').at(-1),
        text,
        depths,
        parens,
        open,
        close: closingBrace(depths, open),
      },
    ];
  });
}

function relationAt(text, parens, end) {
  const segment = text.slice(lastBoundary(text, parens, end), end);
  const names = [...segment.matchAll(ANNOTATION)].map(([, name]) => name.split('.').at(-1));
  const bare = NESTING_PASSES.reduce((rest) => rest.replaceAll(ANNOTATION_CALL, ' '), segment);
  const type = bare
    .replaceAll(ANNOTATION, ' ')
    .replaceAll(MODIFIERS, ' ')
    .replace(/^[^\w$]+/u, '')
    .trim();
  return type === '' ? undefined : fieldRelation(type, names);
}

function fieldIn({ text, depths, parens, open, close }, field) {
  const pattern = new RegExp(String.raw`(?<![\w$.])${escapeRegExp(field)}\s*[;=]`, 'gu');
  const match = [...text.slice(0, close).matchAll(pattern)].find(
    ({ index }) => index > open && depths[index] === depths[open] + 1 && parens[index] === 0,
  );
  return match === undefined ? undefined : relationAt(text, parens, match.index);
}

function indexOf(projectRoot, sourceRoots) {
  const index = new Map();
  const files = sourceRoots.flatMap((root) =>
    sourceFilesUnder(pathInside(projectRoot, root), ['.java']),
  );
  for (const declaration of files.flatMap((file) => declarationsIn(file))) {
    for (const name of new Set([declaration.name, declaration.entityName].filter(Boolean))) {
      index.set(name, [...(index.get(name) ?? []), declaration]);
    }
  }
  return index;
}

export function javaEntities(projectRoot, sourceRoots) {
  let index;
  function relationOf(entity, field) {
    index ??= indexOf(projectRoot, sourceRoots);
    const pending = [entity];
    for (const current of pending) {
      const [declaration, ...others] = index.get(current) ?? [];
      if (declaration === undefined || others.length > 0) {
        return undefined;
      }
      const own = fieldIn(declaration, field);
      if (
        own !== undefined ||
        declaration.superclass === undefined ||
        pending.length > MAX_SUPERCLASSES
      ) {
        return own;
      }
      pending.push(declaration.superclass);
    }
    return undefined;
  }
  return { relationOf };
}
