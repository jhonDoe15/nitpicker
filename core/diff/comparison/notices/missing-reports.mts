import { comparisonKey } from '../fingerprint.mts';
import type { BaseMoves } from '../moved-names/declared/move-types.mts';
import type { TrackedFinding } from '../model/finding-types.mts';

const BROKEN_ON_HEAD = 'The base produced this {tool} report, so the change broke it.';
const NOT_COMPARED = 'Not enforced: no base {tool} report shows whether the change added it.';
const WHOLE_PROJECT = '.';

const NOT_RUN_FIELDS = new Set(['toolNotRun', 'notRunScope', 'notRunIdentityPrefix']);

type BaseNotice = {
  readonly tool: string;
  readonly prefix: string | undefined;
  readonly key: string;
  readonly scope: readonly string[];
};

function reclassified(
  finding: TrackedFinding,
  classification: string,
  sentence: string,
): TrackedFinding {
  return {
    ...Object.fromEntries(Object.entries(finding).filter(([field]) => !NOT_RUN_FIELDS.has(field))),
    tool: finding.tool,
    rule: finding.rule,
    path: finding.path,
    identity: finding.identity,
    classification,
    message: `${finding.message} ${sentence.replace('{tool}', () => finding.tool)}`,
  };
}

function scopeOf(notice: TrackedFinding): readonly string[] {
  return notice.notRunScope ?? [WHOLE_PROJECT];
}

function under(findingPath: string, directory: string): boolean {
  return (
    directory === WHOLE_PROJECT ||
    findingPath === directory ||
    findingPath.startsWith(`${directory}/`)
  );
}

function inScope(scope: readonly string[], findingPath: string): boolean {
  return scope.some((directory) => under(findingPath, directory));
}

function renamedOutOf(directory: string, renames: ReadonlyMap<string, string>): string[] {
  return [...renames].filter(([from]) => under(from, directory)).map(([, to]) => to);
}

function baseNotice(notice: TrackedFinding, moves: BaseMoves): BaseNotice {
  const renames = moves.files;
  const original = scopeOf(notice);
  const moved = original.includes(WHOLE_PROJECT)
    ? []
    : original.flatMap((directory) => renamedOutOf(directory, renames));
  return {
    tool: notice.tool,
    prefix: notice.notRunIdentityPrefix,
    key: comparisonKey(notice, moves),
    scope: [...new Set([...original, ...moved])],
  };
}

function alsoNotRun(notRunOnBase: readonly BaseNotice[], headNotice: TrackedFinding): boolean {
  const sameTool = notRunOnBase.filter(
    (base) => base.tool === headNotice.tool && base.prefix === headNotice.notRunIdentityPrefix,
  );
  const key = comparisonKey(headNotice);
  const scope = sameTool.flatMap((base) => base.scope);
  return (
    sameTool.some((base) => base.key === key) ||
    scopeOf(headNotice).every((directory) => inScope(scope, directory))
  );
}

function covered(notRunOnBase: readonly BaseNotice[], finding: TrackedFinding): boolean {
  return notRunOnBase.some(
    (base) =>
      base.tool === finding.tool &&
      finding.identity.startsWith(base.prefix ?? '') &&
      inScope(base.scope, finding.path),
  );
}

export function againstMissingReports(
  unmatchedHead: readonly TrackedFinding[],
  baseFindings: readonly TrackedFinding[],
  moves: BaseMoves,
): TrackedFinding[] {
  const notRunOnBase = baseFindings
    .filter((finding) => finding.toolNotRun === true)
    .map((notice) => baseNotice(notice, moves));
  return unmatchedHead.map((finding) => {
    if (finding.toolNotRun === true) {
      return alsoNotRun(notRunOnBase, finding)
        ? finding
        : reclassified(finding, 'tool-error', BROKEN_ON_HEAD);
    }
    return finding.classification === 'enforceable' && covered(notRunOnBase, finding)
      ? reclassified(finding, 'descriptive', NOT_COMPARED)
      : finding;
  });
}
