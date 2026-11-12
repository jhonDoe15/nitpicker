import { RULE_IDS } from '../policy.mjs';
import { HYGIENE_RULE_IDS } from '../project-rules/hygiene-rules.mjs';
import { SIZE_RULE_IDS } from '../project-rules/size-rules.mjs';
import { canonicalRule, normalizeFunctionName } from './rule-names.mjs';
import { findingPaths, functionNameOf, pathMatcher } from './matching.mjs';

/** True when `wanted` is the function `symbol`, whatever its parameter list (overloads agree). */
export function functionMatches(wanted, symbol) {
  return (
    typeof symbol === 'string' &&
    symbol !== '' &&
    normalizeFunctionName(symbol) === normalizeFunctionName(wanted)
  );
}

function lifts(entry, finding) {
  return (
    (finding.rule === entry.rule || `${finding.tool}/${finding.rule}` === entry.rule) &&
    findingPaths(finding).some((path) => entry.matches(path)) &&
    (entry.functionName === undefined ||
      functionMatches(entry.functionName, functionNameOf(finding))) &&
    (entry.name === undefined || finding.symbol === entry.name)
  );
}

/** Drops the findings an exception `{ rule, paths, function?, name? }` accepts. */
export function applyFindingExceptions(findings, exceptions = []) {
  if (exceptions.length === 0) {
    return findings;
  }
  const entries = exceptions
    .filter(({ packages }) => packages === undefined)
    .map(({ rule, paths, glob, function: functionName, name }) => ({
      rule,
      functionName,
      name,
      matches: pathMatcher(paths ?? [glob]),
    }));
  return findings.filter((finding) => !entries.some((entry) => lifts(entry, finding)));
}

const FOLDER_RULES = [
  RULE_IDS.folderFiles,
  SIZE_RULE_IDS.folderDepth,
  RULE_IDS.duplicateClone,
  RULE_IDS.stabilityDirection,
  HYGIENE_RULE_IDS.committedBuildOutput,
];

function foldersOf(paths) {
  const folders = new Set(
    paths.flatMap((path) => {
      const parts = path.split('/').slice(0, -1);
      return parts.map((_part, index) => parts.slice(0, index + 1).join('/'));
    }),
  );
  return [...folders].flatMap((folder) => [folder, `${folder}/`]);
}

/**
 * The exceptions that match none of the project's `paths`: the stale ones. A rule that is about a
 * folder (a file count, a depth, a build output) may name the folder itself.
 */
export function exceptionsMatchingNoPath(exceptions, paths) {
  const withFolders = [...paths, ...foldersOf(paths)];
  return exceptions.filter(({ rule, paths: globs }) => {
    const matches = pathMatcher(globs);
    const candidates = FOLDER_RULES.includes(canonicalRule(rule)) ? withFolders : paths;
    return !candidates.some((path) => matches(path));
  });
}
