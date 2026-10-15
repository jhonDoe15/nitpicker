import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { classLimitFindings } from '../../../../shared/rules/size/class-limits.mjs';
import { inheritanceDepths } from './inheritance.mjs';

const CLASSES_REPORT = 'classes.json';

export function readClassLimitFindings(reportRoot, { thresholds, exceptions }) {
  const report = path.join(reportRoot, CLASSES_REPORT);
  if (!existsSync(report)) {
    throw new Error(
      `The ${CLASSES_REPORT} report is missing from ${reportRoot}: the nitpickerStructure step did not write it, so the class limits cannot be checked`,
    );
  }
  const parsed = JSON.parse(readFileSync(report, 'utf8'));
  const depths = inheritanceDepths(parsed);
  const classes = parsed.classes.map((entry) => ({
    ...entry,
    inheritanceDepth: depths.get(entry),
  }));
  return classLimitFindings(classes, { analyzerName: 'structure', thresholds, exceptions });
}
