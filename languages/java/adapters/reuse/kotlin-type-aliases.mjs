import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';

const ENTRY_POINTS_TOOL = 'entry-points';
const ENTRY_POINT_RULES = ['public-alternative-bypass'];
const ALIAS_KEYWORD = 'typealias';
const PRIVATE = 'private';
const ASSIGN = '=';
const DOT = '.';

function targetNames(tokens) {
  const isPath = tokens.every((token, index) =>
    index % 2 === 0 ? token.kind === 'identifier' : token.text === DOT,
  );
  return isPath && tokens.length % 2 === 1
    ? tokens.filter((_, index) => index % 2 === 0).map(({ text }) => text)
    : [];
}

function aliasParts(tokens, { start, end }) {
  const declaration = tokens.slice(start, end);
  const keyword = declaration.findIndex(({ text }) => text === ALIAS_KEYWORD);
  const assign = declaration.findIndex(({ text }) => text === ASSIGN);
  const hidden = declaration.slice(0, Math.max(keyword, 0)).some(({ text }) => text === PRIVATE);
  return keyword === -1 || assign === -1 || hidden
    ? undefined
    : { name: declaration[keyword + 1]?.text, target: targetNames(declaration.slice(assign + 1)) };
}

function typeFileOf(index, fqn, module) {
  const candidates = index.types.get(fqn) ?? [];
  return (candidates.find((candidate) => candidate.module === module) ?? candidates[0])?.file;
}

function targetFile(index, { bindings, module }, target) {
  if (target.length === 1) {
    return (bindings.get(target[0]) ?? []).find(({ type }) => type)?.file;
  }
  return typeFileOf(index, target.join(DOT), module);
}

function aliasReexport(index, entry, definition) {
  const parts = aliasParts(entry.parsed.tokens, definition);
  if (parts === undefined || parts.target.length === 0) {
    return [];
  }
  const to = targetFile(index, entry, parts.target);
  const name = parts.target.at(-1);
  return to === undefined || to === entry.file
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

export function typeAliasReexports(index, entry) {
  return entry.file.endsWith('.kt')
    ? entry.parsed.definitions
        .filter(({ kind, owner }) => kind === 'type' && owner === undefined)
        .flatMap((definition) => aliasReexport(index, entry, definition))
    : [];
}

export function kotlinEntryPointFindings(facts, exceptions) {
  return sharedFactFindings(facts, {
    language: 'kotlin',
    analyzerName: ENTRY_POINTS_TOOL,
    rules: ENTRY_POINT_RULES,
    policy: { exceptions },
  }).filter(({ path: file }) => file.endsWith('.kt'));
}
