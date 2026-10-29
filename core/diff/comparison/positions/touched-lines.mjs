import { insertBeforeRoute } from '../../../../shared/messages/exception-sentence.mjs';

export const EDITED_LINE_SENTENCE = [
  'New because this change edits the line:',
  'lines you change are held to the rule even where the base already broke it.',
  'Leave the line as it was, or bring it up to the rule.',
].join(' ');

export function isHeldOnTouchedLine(finding, touchedCode) {
  return isInTouchedCode(finding, touchedCode) || isOnAddedLine(finding, touchedCode);
}

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

function isInTouchedCode(finding, touchedCode) {
  if (touchedCode === undefined || finding.classification !== 'enforceable') {
    return false;
  }
  if (!touchedCode.isStrictRule(finding.rule, finding)) {
    return false;
  }
  const changed = touchedCode.changedLines.get(finding.path);
  if (changed === undefined) {
    return false;
  }
  if (changed.added) {
    return true;
  }
  if (
    finding.ratchet?.existingCodeOnly === true &&
    touchedCode.mustMeetOnEditedLines?.(finding.rule, finding) !== true
  ) {
    return false;
  }
  const line = finding.location?.line;
  const endLine = finding.location?.endLine ?? line;
  return (
    line !== undefined && changed.ranges.some(([start, end]) => start <= endLine && line <= end)
  );
}

function isOnAddedLine(finding, touchedCode) {
  const line = finding.location?.line;
  const inserted = touchedCode?.changedLines.get(finding.path)?.inserted;
  return (
    finding.ratchet?.existingCodeOnly === true &&
    line !== undefined &&
    (inserted ?? []).some(([start, end]) => start <= line && line <= end)
  );
}
