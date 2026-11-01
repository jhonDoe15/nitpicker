import { insertBeforeRoute } from '../../../../shared/messages/exception-sentence.mjs';

export const EDITED_LINE_SENTENCE = [
  'New because this change edits the line:',
  'lines you change are held to the rule even where the base already broke it.',
  'Leave the line as it was, or bring it up to the rule.',
].join(' ');

export function withEditedLineReason(finding, touchedCode) {
  return isOnEditedLine(finding, touchedCode)
    ? { ...finding, message: insertBeforeRoute(finding.message, EDITED_LINE_SENTENCE) }
    : finding;
}

function covers(ranges, line) {
  return ranges.some(([start, end]) => start <= line && line <= end);
}

function isOnEditedLine(finding, touchedCode) {
  const changed = touchedCode?.changedLines.get(finding.path);
  const line = finding.location?.line;
  if (changed === undefined || changed.added || line === undefined) {
    return false;
  }
  const endLine = Math.max(finding.location.endLine ?? line, line);
  return Array.from({ length: endLine - line + 1 }, (_, offset) => line + offset).some(
    (candidate) => covers(changed.ranges, candidate) && !covers(changed.inserted ?? [], candidate),
  );
}
