import { readFileSync } from 'node:fs';
import {
  blankLiterals,
  pathInside,
  sourceFilesUnder,
} from '../../../review-rules/java-sources.mts';
import { escapeRegExp } from '../../../../../../shared/paths/glob.mjs';
import type { Declaration, Relation, RelationOf, Steps } from '../fetch-types.mts';
import { fieldRelation } from '../fetch-paths.mts';

const CLASS = /\bclass\s+([\w$]+)/gu;
const EXTENDS = /\bextends\s+([\w$.]+)/u;
const ANGLES: Steps = { '<': 1, '>': -1 };
const ENTITY_NAME = /@\s*(?:[\w.]*\.)?Entity\s*\(\s*(?:name\s*=\s*)?"([^"]+)"/u;
const ANNOTATION_CALL = /@\s*[\w$.]+\s*\([^()]*\)/gu;
const ANNOTATION = /@\s*([\w$.]+)/gu;
const MODIFIERS = /\b(?:private|protected|public|static|final|transient|volatile)\b/gu;
const BOUNDARY = /[;{}]/gu;
const STEP: Steps = { '{': 1, '}': -1 };
const PARENS: Steps = { '(': 1, ')': -1 };
const NESTING_PASSES = [0, 1, 2];
const MAX_SUPERCLASSES = 4;

function depthsOf(text: string, step: Steps): Int32Array {
  const depths = new Int32Array(text.length + 1);
  for (const [index, character] of text.split('').entries()) {
    depths[index + 1] = (depths[index] ?? 0) + (step[character] ?? 0);
  }
  return depths;
}

function closingBrace(depths: Int32Array, open: number): number {
  const close = depths.findIndex((depth, index) => index > open && depth === depths[open]);
  return close < 0 ? depths.length : close;
}

function lastBoundary(text: string, parens: Int32Array, end: number): number {
  const found = [...text.slice(0, end).matchAll(BOUNDARY)]
    .filter(({ index }) => parens[index] === 0)
    .at(-1);
  return found === undefined ? 0 : found.index + 1;
}

function headerOf(text: string, from: number): { header: string; open: number } {
  let depth = 0;
  let header = '';
  for (const [offset, character] of Array.from(text.slice(from)).entries()) {
    if (depth === 0 && (character === '{' || character === ';')) {
      return { header, open: character === '{' ? from + offset : -1 };
    }
    depth += ANGLES[character] ?? 0;
    header += depth === 0 && character !== '>' ? character : ' ';
  }
  return { header, open: -1 };
}

function declarationsIn(file: string): Declaration[] {
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
        name: match[1] ?? '',
        entityName: ENTITY_NAME.exec(annotations)?.[1],
        superclass: EXTENDS.exec(header)?.[1]?.split('.').at(-1),
        text,
        depths,
        parens,
        open,
        close: closingBrace(depths, open),
      },
    ];
  });
}

function relationAt(text: string, parens: Int32Array, end: number): Relation | undefined {
  const segment = text.slice(lastBoundary(text, parens, end), end);
  const names = [...segment.matchAll(ANNOTATION)].map(
    ([, name = '']) => name.split('.').at(-1) ?? '',
  );
  const bare = NESTING_PASSES.reduce((rest) => rest.replaceAll(ANNOTATION_CALL, ' '), segment);
  const type = bare
    .replaceAll(ANNOTATION, ' ')
    .replaceAll(MODIFIERS, ' ')
    .replace(/^[^\w$]+/u, '')
    .trim();
  return type === '' ? undefined : fieldRelation(type, names);
}

function fieldIn(
  { text, depths, parens, open, close }: Declaration,
  field: string,
): Relation | undefined {
  const pattern = new RegExp(String.raw`(?<![\w$.])${escapeRegExp(field)}\s*[;=]`, 'gu');
  const match = [...text.slice(0, close).matchAll(pattern)].find(
    ({ index }) => index > open && depths[index] === (depths[open] ?? 0) + 1 && parens[index] === 0,
  );
  return match === undefined ? undefined : relationAt(text, parens, match.index);
}

function indexOf(projectRoot: string, sourceRoots: readonly string[]): Map<string, Declaration[]> {
  const index = new Map<string, Declaration[]>();
  const files = sourceRoots.flatMap((root) =>
    sourceFilesUnder(pathInside(projectRoot, root), ['.java']),
  );
  for (const declaration of files.flatMap((file) => declarationsIn(file))) {
    for (const name of new Set(
      [declaration.name, declaration.entityName].filter(
        (found): found is string => found !== undefined && found !== '',
      ),
    )) {
      index.set(name, [...(index.get(name) ?? []), declaration]);
    }
  }
  return index;
}

export function javaEntities(
  projectRoot: string,
  sourceRoots: readonly string[],
): { relationOf: RelationOf } {
  let index: Map<string, Declaration[]> | undefined;
  function relationOf(entity: string, field: string): Relation | undefined {
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
