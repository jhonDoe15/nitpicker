import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { classLimitFindings } from '../../../../shared/rules/size/class-limits.mjs';
import { inModule } from '../../builds/module-path.mjs';
import { inheritanceDepths } from './inheritance.mjs';
import { callUntyped } from '../typed/java-values.mts';
import { fieldOf, fieldsOf, listOf } from '../../../../shared/values/readers.mts';

const CLASSES_REPORT = 'classes.json';

export function readClassLimitFindings(reportRoot: string, limits: unknown): unknown {
  const report = path.join(reportRoot, CLASSES_REPORT);
  if (!existsSync(report)) {
    throw new Error(
      `The ${CLASSES_REPORT} report is missing from ${reportRoot}: the structure step (StructureMetrics.java) did not write it, so the class limits cannot be checked`,
    );
  }
  const parsed: unknown = JSON.parse(readFileSync(report, 'utf8'));
  const depths = callUntyped(inheritanceDepths, parsed);
  const classes = listOf(fieldOf(parsed, 'classes')).map((entry) => {
    const inheritanceDepth: unknown = depths instanceof Map ? depths.get(entry) : undefined;
    return { ...fieldsOf(entry), inheritanceDepth };
  });
  return callUntyped(classLimitFindings, classes, {
    analyzerName: 'structure',
    thresholds: fieldOf(limits, 'thresholds'),
    exceptions: fieldOf(limits, 'exceptions'),
    projectPath: (file: unknown) => inModule(fieldOf(limits, 'modulePath'), file),
  });
}
