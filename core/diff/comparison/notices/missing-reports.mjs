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

function under(findingPath, directory) {
  return (
    directory === WHOLE_PROJECT ||
    findingPath === directory ||
    findingPath.startsWith(`${directory}/`)
  );
}

function inScope(scope, findingPath) {
  return scope.some((directory) => under(findingPath, directory));
}

function baseMoves(renames, directories) {
  const inferred = [...directoryMoves(renames)].filter(([from]) => from !== '');
  return new Map([...inferred, ...directories]);
}

function movedScope(directory, moves) {
  if (directory === WHOLE_PROJECT) {
    return { scope: [directory], whole: false };
  }
  const movedFiles = [...moves.renames]
    .filter(([from]) => under(from, directory))
    .map(([, to]) => to);
  const target = mapDirectory(directory, moves.folders);
  const whole =
    target !== directory &&
    movedFiles.length > 0 &&
    moves.kept !== undefined &&
    ![...moves.kept].some((kept) => under(kept, directory));
  return { scope: [whole ? target : directory, ...movedFiles], whole };
}

function baseNotice(notice, moves) {
  const moved = scopeOf(notice).map((directory) => movedScope(directory, moves));
  return {
    tool: notice.tool,
    key: moved.some(({ whole }) => whole)
      ? undefined
      : comparisonKey(notice, moves.renames, moves.directories),
    scope: [...new Set(moved.flatMap(({ scope }) => scope))],
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

export function againstMissingReports(headFindings, baseFindings, { renames, directories, kept }) {
  const moves = { renames, directories, kept, folders: baseMoves(renames, directories) };
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
