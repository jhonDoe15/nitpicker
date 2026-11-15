import { describeConventions } from './convention-views.mts';
import type { ReportRequest } from './convention-types.mts';

export function conventionsReport({
  detected,
  followed,
  style,
  conventions,
  notes: collected,
}: ReportRequest): string {
  const lines = describeConventions(detected, followed, style.note).map((line) => `  ${line}\n`);
  const notes = [...collected, ...(style.summary?.(conventions) ?? [])].map((line) => `${line}\n`);
  const heading = followed.length === 0 ? '' : "Following this project's conventions:\n";
  return `${heading}${lines.join('')}${notes.join('')}`;
}
