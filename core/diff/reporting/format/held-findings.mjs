import { singleLine } from './text.mjs';

export function heldFindings(unchangedFindings = []) {
  const held = unchangedFindings.filter((finding) => finding.heldAtBase !== undefined);
  return {
    metrics: held.filter((finding) => finding.ratchet?.worseMessage !== undefined),
    lint: held.filter((finding) => finding.ratchet?.worseMessage === undefined),
  };
}

export function heldLine(finding) {
  const { ratchet, heldAtBase } = finding;
  const base = String(heldAtBase);
  const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
  const prefix = `${finding.tool}/${finding.rule} ${finding.path}${location}`;
  if (ratchet?.worseMessage === undefined) {
    const counts =
      ratchet.value === heldAtBase
        ? `${base} at base and now`
        : `${base} at base, ${String(ratchet.value)} now`;
    return `${prefix} ${singleLine(finding.message)} (${counts}; any increase fails)`;
  }
  const note =
    ratchet.heldMessage === undefined
      ? `${singleLine(finding.message)} (allowed because base was ${base}; any increase fails)`
      : ratchet.heldMessage.replaceAll('{base}', base);
  return `${prefix} ${note}`;
}
