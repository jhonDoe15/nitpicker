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

export function isHeldOnTouchedLine(finding, touchedCode) {
  return isInTouchedCode(finding, touchedCode) || isOnAddedLine(finding, touchedCode);
}

export function isOnInsertedLine(finding, touchedCode) {
  const line = finding.location?.line;
  const changed = touchedCode?.changedLines.get(finding.path);
  return (
    line !== undefined &&
    changed !== undefined &&
    (changed.added === true ||
      (changed.inserted ?? []).some(([start, end]) => start <= line && line <= end))
  );
}

export function isBelowChange(finding, touchedCode) {
  const line = finding.location?.line;
  const ranges = touchedCode?.changedLines.get(finding.path)?.ranges ?? [];
  return line !== undefined && ranges.some(([start]) => start < line);
}

export function isOnUnchangedLine(finding, touchedCode) {
  const line = finding.location?.line;
  if (line === undefined) {
    return false;
  }
  const changed = touchedCode?.changedLines.get(finding.path);
  return (
    changed === undefined ||
    (!changed.added && !changed.ranges.some(([start, end]) => start <= line && line <= end))
  );
}
