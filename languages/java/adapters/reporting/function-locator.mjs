import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readKotlinMetrics } from '../kotlin/kotlin-metrics.mjs';
import { readStructureFunctions } from '../../../../shared/ingest/structure-report.mjs';
import {
  declarationLine,
  enclosingFunction,
  hash,
  nameFreeHash,
} from '../../../../shared/rules/finding-helpers.mjs';
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

function unitOf(unit, lines) {
  if (unit.end > lines.length) {
    return { name: unit.name };
  }
  const body = lines
    .slice(unit.start - 1, unit.end)
    .map((line) => line.trim())
    .join('\n');
  return {
    name: unit.name,
    anchorHash: nameFreeHash(body, unit.name),
    declarationHash: hash(unit.signature ?? declarationLine(body)),
  };
}

function unitLocatorOver(functions, projectRoot) {
  const sourceText = sourceTextReader(projectRoot);
  const sources = new Map();
  const sourceOf = (file) => {
    if (!sources.has(file)) {
      const text = sourceText(file);
      sources.set(file, {
        lines: text?.split(/\r?\n/u) ?? [],
        units: [
          ...functions.filter((unit) => unit.file === file),
          ...(text === undefined ? [] : declarationUnits(file, text)),
        ],
      });
    }
    return sources.get(file);
  };
  return (file, line) => {
    const { lines, units } = sourceOf(file);
    const unit = enclosingFunction(units, file, line);
    return unit === undefined ? undefined : unitOf(unit, lines);
  };
}

export function functionUnitLocator(context) {
  return unitLocatorOver(structureFunctions(context), context.projectRoot);
}

export function functionLocator(context) {
  const locate = functionUnitLocator(context);
  return (file, line) => locate(file, line)?.name;
}

export function modulesUnitLocator(projectRoot, modules, kotlinPreset) {
  const contexts = modules.map((module) => ({
    reportRoot: module.reportRoot,
    kotlin: kotlinPreset && module.manifest.kotlin === true,
  }));
  return unitLocatorOver(contexts.flatMap(structureFunctions), projectRoot);
}
