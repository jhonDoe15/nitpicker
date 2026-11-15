import type { Planned, ProjectFinding, ProjectFix } from '../typed/project-types.mts';

type Sink<Item> = { push(item: Item): number };

export function recordPlan(
  { fixes, notes }: { readonly fixes: Sink<ProjectFix>; readonly notes: Sink<string> },
  {
    planned,
    finding,
    rule,
  }: {
    readonly planned: Planned | undefined;
    readonly finding: ProjectFinding;
    readonly rule: string;
  },
): void {
  if (planned === undefined) {
    return;
  }
  if (planned.edits === undefined) {
    notes.push(`--fix left ${finding.path}:${String(finding.line)} ${rule}: ${planned.declined}`);
    return;
  }
  fixes.push({ finding, edits: planned.edits });
}
