import { RULE_IDS } from '../policy.mts';
import { HYGIENE_RULE_IDS } from '../project-rules/hygiene-rules.mts';
import { SIZE_RULE_IDS } from '../project-rules/size-rules.mts';
import { canonicalRule, normalizeFunctionName } from './rule-names.mts';
import { globsMatcher } from '../paths/glob.mts';
import { findingPaths, functionNameOf, type MatchedFinding } from './matching.mts';

type ExceptionEntry = {
  readonly rule: string;
  readonly paths?: readonly string[];
  readonly glob?: string;
  readonly function?: string;
  readonly name?: string;
  readonly packages?: unknown;
};

type Lifter = {
  readonly rule: string;
  readonly functionName: string | undefined;
  readonly name: string | undefined;
  readonly matches: (path: string) => boolean;
};

export function functionMatches(wanted: string, symbol: unknown): boolean {
  return (
    typeof symbol === 'string' &&
    symbol !== '' &&
    normalizeFunctionName(symbol) === normalizeFunctionName(wanted)
  );
}

function lifts(entry: Lifter, finding: MatchedFinding): boolean {
  return (
    (finding.rule === entry.rule || `${finding.tool}/${finding.rule}` === entry.rule) &&
    findingPaths(finding).some((path) => entry.matches(path)) &&
    (entry.functionName === undefined ||
      functionMatches(entry.functionName, functionNameOf(finding))) &&
    (entry.name === undefined || finding.symbol === entry.name)
  );
}

export function applyFindingExceptions<Finding extends MatchedFinding>(
  findings: readonly Finding[],
  exceptions: readonly ExceptionEntry[] = [],
): readonly Finding[] {
  if (exceptions.length === 0) {
    return findings;
  }
  const entries = exceptions
    .filter(({ packages }) => packages === undefined)
    .map(({ rule, paths, glob, function: functionName, name }) => ({
      rule,
      functionName,
      name,
      matches: globsMatcher(paths ?? (glob === undefined ? [] : [glob])),
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

function foldersOf(paths: readonly string[]): string[] {
  const folders = new Set(
    paths.flatMap((path) => {
      const parts = path.split('/').slice(0, -1);
      return parts.map((_part, index) => parts.slice(0, index + 1).join('/'));
    }),
  );
  return [...folders].flatMap((folder) => [folder, `${folder}/`]);
}

export function exceptionsMatchingNoPath<
  Entry extends { readonly rule: string; readonly paths: readonly string[] },
>(exceptions: readonly Entry[], paths: readonly string[]): Entry[] {
  const withFolders = [...paths, ...foldersOf(paths)];
  return exceptions.filter(({ rule, paths: globs }) => {
    const matches = globsMatcher(globs);
    const candidates = FOLDER_RULES.includes(canonicalRule(rule)) ? withFolders : paths;
    return !candidates.some((path) => matches(path));
  });
}
