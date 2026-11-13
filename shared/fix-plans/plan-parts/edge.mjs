import { importSpecifier, linesOf } from './source.mjs';

export function importEdge(finding, env) {
  const line = finding.location?.line;
  const text = env.read(finding.path);
  const source = text === undefined || line === undefined ? undefined : linesOf(text)[line - 1];
  const specifier = importSpecifier(source);
  return specifier === undefined
    ? undefined
    : { from: finding.path, line, specifier, source: source.trim() };
}
