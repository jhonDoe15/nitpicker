import { folderOf as untypedFolderOf } from '../../../../shared/rules/entry-points/public-alternatives.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { callUntyped, findingsOf, type JavaFinding } from '../typed/java-values.mts';
import type { BoundEntry, Definition, ProjectIndex, Reexport, Token } from './jvm-reuse-types.mts';

const folderOf: (file: string) => string = untypedFolderOf;

const ENTRY_POINTS_TOOL = 'entry-points';
const ENTRY_POINT_RULES = ['public-alternative-bypass'];
const ALIAS_KEYWORD = 'typealias';
const HIDDEN_MODIFIERS = new Set(['private', 'internal']);
const ASSIGN = '=';
const DOT = '.';

function targetNames(tokens: readonly Token[]): string[] {
  const isPath = tokens.every((token, index) =>
    index % 2 === 0 ? token.kind === 'identifier' : token.text === DOT,
  );
  return isPath && tokens.length % 2 === 1
    ? tokens.filter((_, index) => index % 2 === 0).map(({ text }) => text)
    : [];
}

function aliasParts(
  tokens: readonly Token[],
  { start, end }: Pick<Definition, 'start' | 'end'>,
): { name: string | undefined; target: string[] } | undefined {
  const declaration = tokens.slice(start, end);
  const keyword = declaration.findIndex(({ text }) => text === ALIAS_KEYWORD);
  const assign = declaration.findIndex(({ text }) => text === ASSIGN);
  const hidden = declaration
    .slice(0, Math.max(keyword, 0))
    .some(({ text }) => HIDDEN_MODIFIERS.has(text));
  return keyword === -1 || assign === -1 || hidden
    ? undefined
    : { name: declaration[keyword + 1]?.text, target: targetNames(declaration.slice(assign + 1)) };
}

function isSubfolderFile(target: string, alias: string): boolean {
  const folder = folderOf(alias);
  return target.startsWith(folder) && folderOf(target) !== folder;
}

function typeFileOf(index: ProjectIndex, fqn: string, module: string): string | undefined {
  const candidates = index.types.get(fqn) ?? [];
  return (candidates.find((candidate) => candidate.module === module) ?? candidates[0])?.file;
}

function targetFile(
  index: ProjectIndex,
  { bindings, module }: BoundEntry,
  target: readonly string[],
): string | undefined {
  if (target.length === 1) {
    return (bindings.get(target[0] ?? '') ?? []).find(({ type }) => type === true)?.file;
  }
  return typeFileOf(index, target.join(DOT), module);
}

function aliasReexport(index: ProjectIndex, entry: BoundEntry, definition: Definition): Reexport[] {
  const parts = aliasParts(entry.parsed.tokens, definition);
  if (parts === undefined || parts.target.length === 0) {
    return [];
  }
  const to = targetFile(index, entry, parts.target);
  const name = parts.target.at(-1) ?? '';
  return to === undefined || !isSubfolderFile(to, entry.file)
    ? []
    : [
        {
          from: entry.file,
          to,
          names: [parts.name === name ? { name } : { name, alias: parts.name }],
          reexport: true,
        },
      ];
}

export function typeAliasReexports(index: ProjectIndex, entry: BoundEntry): Reexport[] {
  return entry.file.endsWith('.kt')
    ? entry.parsed.definitions
        .filter(({ kind, owner }) => kind === 'type' && owner === undefined)
        .flatMap((definition) => aliasReexport(index, entry, definition))
    : [];
}

export function aliasEntryFields(
  entry: BoundEntry,
  reexports: readonly Reexport[],
): { publicNames?: string[]; entryName?: string } {
  const publicNames = reexports
    .filter(({ from }) => from === entry.file)
    .flatMap(({ names }) => names.map(({ name, alias }) => alias ?? name));
  return publicNames.length === 0
    ? {}
    : {
        publicNames,
        entryName: entry.parsed.packageName === '' ? entry.file : entry.parsed.packageName,
      };
}

export function kotlinEntryPointFindings(facts: unknown, exceptions: unknown): JavaFinding[] {
  return findingsOf(
    callUntyped(sharedFactFindings, facts, {
      language: 'kotlin',
      analyzerName: ENTRY_POINTS_TOOL,
      rules: ENTRY_POINT_RULES,
      policy: { exceptions },
    }),
  ).filter(({ path: file }) => file.endsWith('.kt'));
}
