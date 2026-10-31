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

function locatorOver(functions, projectRoot) {
  const sourceText = sourceTextReader(projectRoot);
  return (file, line) => {
    const text = sourceText(file);
    const units = text === undefined ? [] : declarationUnits(file, text);
    return enclosingFunctionName([...functions, ...units], file, line);
  };
}

export function functionLocator(context) {
  return locatorOver(structureFunctions(context), context.projectRoot);
}

export function modulesFunctionLocator(projectRoot, modules, kotlinPreset) {
  const contexts = modules.map((module) => ({
    reportRoot: module.reportRoot,
    kotlin: kotlinPreset && module.manifest.kotlin === true,
  }));
  return locatorOver(contexts.flatMap(structureFunctions), projectRoot);
}
