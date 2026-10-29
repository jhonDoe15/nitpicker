import { closingIndex } from '../kotlin-source.mjs';

const DEPRECATED = /(?<![\w.])@(?:kotlin\.)?Deprecated\b/g;
const DECLARATION_KEYWORD = /\b(?:fun|val|var|class|interface|object|typealias|constructor)\b/;
const ALIAS = /(?<![\w.])typealias\s+([A-Z]\w*)\s*=\s*([A-Z]\w*)\s*$/gm;

export const COMPATIBILITY_SHIM_MESSAGES = {
  CompatibilityShim:
    'Delete the deprecated declaration and change its callers to the replacement in the same change: `@Deprecated` and a second name for one type (`typealias Old = New`) keep two APIs alive.',
};

function annotatedDeclaration(code, match) {
  let end = match.index + match[0].length;
  if (/^\s*\(/.test(code.slice(end))) {
    end = closingIndex(code, end + code.slice(end).indexOf('(')) + 1;
  }
  const rest = code.slice(end, end + 400);
  const keyword = DECLARATION_KEYWORD.exec(rest);
  return keyword === null ? rest : rest.slice(0, keyword.index);
}

function deprecations(code) {
  return [...code.matchAll(DEPRECATED)]
    .filter((match) => !/\boverride\b/.test(annotatedDeclaration(code, match)))
    .map((match) => ({ rule: 'CompatibilityShim', offset: match.index, subject: '@Deprecated' }));
}

function aliases(code) {
  return [...code.matchAll(ALIAS)]
    .filter(
      ([, alias, target]) =>
        alias !== target &&
        new RegExp(String.raw`(?<![\w.])(?:class|interface|object|typealias)\s+${target}\b`).test(
          code,
        ),
    )
    .map((match) => ({
      rule: 'CompatibilityShim',
      offset: match.index,
      subject: `typealias ${match[1]}`,
    }));
}

export function compatibilityShims(scanned) {
  return [...deprecations(scanned.code), ...aliases(scanned.code)];
}
