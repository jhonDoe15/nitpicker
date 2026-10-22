import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readKotlinMetrics } from '../kotlin/kotlin-metrics.mjs';
import { readStructureFunctions } from '../../../../shared/ingest/structure-report.mjs';
import { enclosingFunctionName } from '../../../../shared/rules/finding-helpers.mjs';
import { javaDeclarationUnits } from '../../ingest/declarations/java-declaration-units.mjs';

export function structureFunctions({ reportRoot, kotlin }) {
  return [
    ...readStructureFunctions(reportRoot),
    ...(kotlin ? readKotlinMetrics(reportRoot).functions : []),
  ];
}

export function declarationUnits(file, text) {
  return file.endsWith('.java') ? javaDeclarationUnits(file, text) : [];
}

export function sourceTextReader(projectRoot) {
  const root = path.resolve(projectRoot);
  return (file) => {
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(root + path.sep)) {
      return undefined;
    }
    return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
  };
}

export function functionLocator(context) {
  const functions = structureFunctions(context);
  const sourceText = sourceTextReader(context.projectRoot);
  return (file, line) => {
    const text = sourceText(file);
    const units = text === undefined ? [] : declarationUnits(file, text);
    return enclosingFunctionName([...functions, ...units], file, line);
  };
}
