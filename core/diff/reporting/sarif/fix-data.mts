import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';

export type FixEdit = {
  readonly type: string;
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

export type FixData = {
  readonly edits: readonly FixEdit[];
  readonly textLength?: number;
  readonly recipe: string;
  readonly safety: string;
};

function isFixData(value: unknown): value is FixData {
  return (
    Array.isArray(fieldOf(value, 'edits')) &&
    typeof fieldOf(value, 'recipe') === 'string' &&
    typeof fieldOf(value, 'safety') === 'string'
  );
}

export function fixOf(finding: ReportEntry): FixData | undefined {
  const { fix } = finding;
  return isFixData(fix) ? fix : undefined;
}
