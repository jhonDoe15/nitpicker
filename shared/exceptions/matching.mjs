import { globMatcher } from '../paths/glob.mjs';

/** A test for a path against any of `globs`. */
export function pathMatcher(globs) {
  const matchers = globs.map((glob) => globMatcher(glob));
  return (path) => matchers.some((matcher) => matcher.test(path));
}

const LAMBDA = /^lambda\$(.+)\$\d+$/u;

function pitFunctionName(symbol) {
  const separator = symbol.indexOf('#');
  if (separator === -1) {
    return symbol;
  }
  const className = symbol.slice(symbol.slice(0, separator).lastIndexOf('.') + 1, separator);
  const classNames = className.split('$');
  const method = symbol.slice(separator + 1).replace(/\(.*$/su, '');
  const name = method === '<init>' ? classNames.at(-1) : (LAMBDA.exec(method)?.[1] ?? method);
  return [...classNames, name === 'new' ? classNames.at(-1) : name].join('.');
}

/** The name of the function a finding is about, as an `exceptions` entry's `function` writes it. */
export function functionNameOf(finding) {
  if (typeof finding.symbol !== 'string' || finding.symbol === '') {
    return undefined;
  }
  return finding.tool === 'pit' ? pitFunctionName(finding.symbol) : finding.symbol;
}

const PAIR_END = /:(?:fragment|occurrence):/;

export function clonePartnerPath(finding) {
  const prefix = `pair:${finding.path}|`;
  if (
    !['duplicate-clone', 'duplicate-clone-size'].includes(finding.rule) ||
    !finding.identity.startsWith(prefix)
  ) {
    return undefined;
  }
  const rest = finding.identity.slice(prefix.length);
  const end = rest.search(PAIR_END);
  return end < 0 ? undefined : rest.slice(0, end);
}

export function findingPaths(finding) {
  const partner = clonePartnerPath(finding);
  return partner === undefined ? [finding.path] : [finding.path, partner];
}
