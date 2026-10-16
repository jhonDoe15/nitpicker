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

function inHeadDirectories(notice, moves) {
  const scope = scopeOf(notice).map((directory) =>
    directory === WHOLE_PROJECT ? directory : mapDirectory(directory, moves),
  );
  return { tool: notice.tool, scope };
}

function covers(baseNotice, finding) {
  return baseNotice.tool === finding.tool && inScope(baseNotice.scope, finding.path);
}

function alsoNotRun(baseNotice, headNotice) {
  return (
    baseNotice.tool === headNotice.tool &&
    scopeOf(headNotice).every((directory) => inScope(baseNotice.scope, directory))
  );
}

export function againstMissingReports(headFindings, baseFindings, { renames, directories }) {
  const directoryMap = baseMoves(renames, directories);
  const notRunOnBase = baseFindings
    .filter((finding) => finding.toolNotRun === true)
    .map((notice) => inHeadDirectories(notice, directoryMap));
  return headFindings.map((finding) => {
    if (finding.toolNotRun === true) {
      return notRunOnBase.some((base) => alsoNotRun(base, finding))
        ? finding
        : reclassified(finding, 'tool-error', BROKEN_ON_HEAD);
    }
    return finding.classification === 'enforceable' &&
      notRunOnBase.some((base) => covers(base, finding))
      ? reclassified(finding, 'descriptive', NOT_COMPARED)
      : finding;
  });
}
