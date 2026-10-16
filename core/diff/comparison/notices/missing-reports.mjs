import { comparisonKey } from '../fingerprint.mjs';
import { directoryMoves, mapDirectory } from '../../git/patches/renames.mjs';

const BROKEN_ON_HEAD = 'The base produced this {tool} report, so the change broke it.';
const NOT_COMPARED = 'Not enforced: no base {tool} report shows whether the change added it.';
const WHOLE_PROJECT = '.';

const NOT_RUN_FIELDS = new Set(['toolNotRun', 'notRunScope']);

function reclassified(finding, classification, sentence) {
  return {
    ...Object.fromEntries(Object.entries(finding).filter(([field]) => !NOT_RUN_FIELDS.has(field))),
    classification,
    message: `${finding.message} ${sentence.replace('{tool}', finding.tool)}`,
  };
}

function scopeOf(notice) {
  return notice.notRunScope ?? [WHOLE_PROJECT];
}

function inScope(scope, findingPath) {
  return scope.some(
    (directory) =>
      directory === WHOLE_PROJECT ||
      findingPath === directory ||
      findingPath.startsWith(`${directory}/`),
  );
}

function baseMoves(renames, directories) {
  const inferred = [...directoryMoves(renames)].filter(([from]) => from !== '');
  return new Map([...inferred, ...directories]);
}

function baseNotice(notice, moves) {
  const original = scopeOf(notice);
  const moved = original.map((directory) =>
    directory === WHOLE_PROJECT ? directory : mapDirectory(directory, moves.folders),
  );
  return {
    tool: notice.tool,
    key: comparisonKey(notice, moves.renames, moves.directories),
    scope: [...new Set([...original, ...moved])],
  };
}

function alsoNotRun(notRunOnBase, headNotice) {
  const sameTool = notRunOnBase.filter((base) => base.tool === headNotice.tool);
  const key = comparisonKey(headNotice);
  const scope = sameTool.flatMap((base) => base.scope);
  return (
    sameTool.some((base) => base.key === key) ||
    scopeOf(headNotice).every((directory) => inScope(scope, directory))
  );
}

function covered(notRunOnBase, finding) {
  return notRunOnBase.some(
    (base) => base.tool === finding.tool && inScope(base.scope, finding.path),
  );
}

export function againstMissingReports(headFindings, baseFindings, { renames, directories }) {
  const moves = { renames, directories, folders: baseMoves(renames, directories) };
  const notRunOnBase = baseFindings
    .filter((finding) => finding.toolNotRun === true)
    .map((notice) => baseNotice(notice, moves));
  return headFindings.map((finding) => {
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
