import path from 'node:path';
import { withoutComments } from './code.mjs';
import { memoized, projectFiles, textOf } from '../project-tests.mjs';

const IMPORT = /^[ \t]*import\b([^'";(]*)['"]([^'"]+)['"]/gmu;
const RE_EXPORT =
  /^[ \t]*export\s+(?:type\s+)?(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/gmu;
const CALL = /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/gu;
const DECLARED = new RegExp(
  String.raw`^[ \t]*export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?` +
    String.raw`(?:function\*?|class|const|let|var|interface|type|enum)\s+([\w$]+)`,
  'gmu',
);
const EXPORT_LIST = /^[ \t]*export\s*(?:type\s*)?\{([^}]*)\}(?!\s*from)/gmu;
const SCRIPT_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];
const RUNTIME_EXTENSION = /\.(?:[cm]?js|jsx)$/u;

export function isScript(file) {
  return SCRIPT_EXTENSIONS.includes(file.split('.').at(-1));
}

function resolved(from, specifier, known) {
  if (!specifier.startsWith('.')) {
    return undefined;
  }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  const bare = base.replace(RUNTIME_EXTENSION, '');
  const options = [
    base,
    ...SCRIPT_EXTENSIONS.flatMap((extension) => [
      `${bare}.${extension}`,
      `${base}/index.${extension}`,
    ]),
  ];
  return options.find((option) => known.has(option));
}

function nameOf(part) {
  return part
    .trim()
    .replace(/^type\s+/u, '')
    .split(/\s+as\s+/u)[0];
}

function importClause(text) {
  return text.replace(/^\s*type\b/u, '').replace(/\bfrom\s*$/u, '');
}

function clauseNames(clause) {
  const text = (clause ?? '').trim();
  if (text === '' || text.includes('*')) {
    return undefined;
  }
  const braces = /\{([^}]*)\}/u.exec(text)?.[1];
  const outside = text
    .replace(/\{[^}]*\}/u, '')
    .replace(/,/gu, '')
    .trim();
  return [
    ...(outside === '' ? [] : ['default']),
    ...(braces ?? '')
      .split(',')
      .map(nameOf)
      .filter((name) => name !== ''),
  ];
}

function entriesOf(env, file, patterns) {
  const { known } = projectFiles(env);
  const text = withoutComments(textOf(env, file));
  return patterns
    .flatMap(([pattern, namesOf]) =>
      [...text.matchAll(pattern)].map((match) => ({ match, namesOf })),
    )
    .map(({ match, namesOf }) => ({
      file: resolved(file, match.at(-1) ?? '', known),
      names: namesOf(match),
    }))
    .filter((entry) => entry.file !== undefined);
}

export function importsOf(env, file) {
  return memoized(env, `imports:${file}`, () =>
    entriesOf(env, file, [
      [IMPORT, (match) => clauseNames(importClause(match[1]))],
      [CALL, () => undefined],
    ]),
  );
}

export function reExportsOf(env, file) {
  return memoized(env, `reexports:${file}`, () =>
    entriesOf(env, file, [[RE_EXPORT, (match) => clauseNames(match[1])]]),
  );
}

export function exportedNames(env, file) {
  return memoized(env, `exports:${file}`, () => {
    const text = withoutComments(textOf(env, file));
    const names = new Set([...text.matchAll(DECLARED)].map((match) => match[1]));
    for (const [, list] of text.matchAll(EXPORT_LIST)) {
      for (const part of list.split(',')) {
        names.add(
          part
            .trim()
            .split(/\s+as\s+/u)
            .at(-1),
        );
      }
    }
    if (/^[ \t]*export\s+default\b/mu.test(text)) {
      names.add('default');
    }
    return names;
  });
}
