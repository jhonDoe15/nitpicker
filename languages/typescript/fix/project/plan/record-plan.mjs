export function recordPlan({ fixes, notes }, { planned, finding, rule }) {
  if (planned === undefined) {
    return;
  }
  if (planned.edits === undefined) {
    notes.push(`--fix left ${finding.path}:${finding.line} ${rule}: ${planned.declined}`);
    return;
  }
  fixes.push({ finding, edits: planned.edits });
}
