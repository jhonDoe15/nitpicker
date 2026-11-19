import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readKotlinMetrics, type Metrics } from '../kotlin/kotlin-metrics.mts';
import { readStructureFunctions } from '../../../../shared/ingest/structure-report.mjs';
import {
  declarationLine,
  enclosingFunction,
  hash,
  nameFreeHash,
} from '../../../../shared/rules/finding-helpers.mjs';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import { javaDeclarationUnits } from '../../ingest/declarations/java-declaration-units.mts';

export type FunctionUnit = {
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly signature?: string | undefined;
  readonly [field: string]: unknown;
};
type UnitLocation = {
  readonly name: string;
  readonly anchorHash?: string;
  readonly declarationHash?: string;
};
export type UnitLocator = (file: string, line: number) => UnitLocation | undefined;
type UnitContext = { readonly reportRoot: string; readonly kotlin: boolean };
type LocatorContext = UnitContext & { readonly projectRoot: string };
type FileSource = { readonly lines: string[]; readonly units: FunctionUnit[] };

const structureUnits: (reportRoot: string) => FunctionUnit[] = readStructureFunctions;
const metricsUnits: (reportRoot: string) => Metrics = readKotlinMetrics;
const declaredUnits: (file: string, text: string) => FunctionUnit[] = javaDeclarationUnits;
const enclosing: (
  units: readonly FunctionUnit[],
  file: string,
  line: number,
) => FunctionUnit | undefined = enclosingFunction;
const hashOf: (value: string) => string = hash;
const bodyHash: (body: string, name: string) => string = nameFreeHash;
const firstLine: (body: string) => string = declarationLine;

export function structureFunctions({ reportRoot, kotlin }: UnitContext): FunctionUnit[] {
  return [...structureUnits(reportRoot), ...(kotlin ? metricsUnits(reportRoot).functions : [])];
}

export function declarationUnits(file: string, text: string): FunctionUnit[] {
  return file.endsWith('.java') ? declaredUnits(file, text) : [];
}

export function sourceTextReader(projectRoot: string): (file: string) => string | undefined {
  const root = path.resolve(projectRoot);
  return (file) => {
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(root + path.sep)) {
      return undefined;
    }
    return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
  };
}

function unitOf(unit: FunctionUnit, lines: readonly string[]): UnitLocation {
  if (unit.end > lines.length) {
    return { name: unit.name };
  }
  const body = lines
    .slice(unit.start - 1, unit.end)
    .map((line) => line.trim())
    .join('\n');
  return {
    name: unit.name,
    anchorHash: bodyHash(body, unit.name),
    declarationHash: hashOf(unit.signature ?? firstLine(body)),
  };
}

function fileSource(
  functions: readonly FunctionUnit[],
  sourceText: (file: string) => string | undefined,
  file: string,
): FileSource {
  const text = sourceText(file);
  return {
    lines: text?.split(/\r?\n/u) ?? [],
    units: [
      ...functions.filter((unit) => unit.file === file),
      ...(text === undefined ? [] : declarationUnits(file, text)),
    ],
  };
}

function unitLocatorOver(functions: readonly FunctionUnit[], projectRoot: string): UnitLocator {
  const sourceText = sourceTextReader(projectRoot);
  const sources = new Map<string, FileSource>();
  return (file, line) => {
    let source = sources.get(file);
    if (source === undefined) {
      source = fileSource(functions, sourceText, file);
      sources.set(file, source);
    }
    const { lines, units } = source;
    const unit = enclosing(units, file, line);
    return unit === undefined ? undefined : unitOf(unit, lines);
  };
}

export function functionUnitLocator(context: LocatorContext): UnitLocator {
  return unitLocatorOver(structureFunctions(context), context.projectRoot);
}

export function functionLocator(
  context: LocatorContext,
): (file: string, line: number) => string | undefined {
  const locate = functionUnitLocator(context);
  return (file, line) => locate(file, line)?.name;
}

export function modulesUnitLocator(
  projectRoot: string,
  modules: readonly unknown[],
  kotlinPreset: boolean,
): UnitLocator {
  const contexts = modules.map((module) => ({
    reportRoot: textOf(fieldOf(module, 'reportRoot')),
    kotlin: kotlinPreset && fieldOf(fieldOf(module, 'manifest'), 'kotlin') === true,
  }));
  return unitLocatorOver(contexts.flatMap(structureFunctions), projectRoot);
}
