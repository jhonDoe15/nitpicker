import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { declarationLine, hash, nameFreeHash, repeatsInSource } from '../rules/finding-parts.mts';
import { evaluateStructure } from '../rules/structure.mts';
import type { Finding } from '../values/findings.mts';
import { isRecord } from '../rules/facts/checks.mts';
import { parseJson } from '../values/readers.mts';
import type {
  SourceCache,
  SourceRange,
  StructureEntry,
  StructureOptions,
} from './typed/report-types.mts';

const STRUCTURE_REPORT = 'structure.json';
export const STRUCTURE_TOOL = 'structure';

function isStructureEntries(value: unknown): value is StructureEntry[] {
  return Array.isArray(value) && value.every(isRecord);
}

export function readStructureFunctions(reportRoot: string): StructureEntry[] {
  const report = path.join(reportRoot, STRUCTURE_REPORT);
  const parsed: unknown = existsSync(report) ? parseJson(readFileSync(report, 'utf8')) : [];
  return isStructureEntries(parsed) ? parsed : [];
}

export function readStructureFindings(
  reportRoot: string,
  projectRoot: string,
  options?: StructureOptions,
): Finding[] {
  const entries = readStructureFunctions(reportRoot);
  return entries.length === 0 ? [] : structureFindings(entries, projectRoot, options);
}

export function structureFindings(
  entries: readonly StructureEntry[],
  projectRoot: string,
  { textOf = methodText, hints, numberedAmongSameSource }: StructureOptions = {},
): Finding[] {
  const sources: SourceCache = new Map();
  const functions = entries.map((entry) => {
    const text = textOf(sources, projectRoot, entry);
    return {
      ...entry,
      numberedAmongSameSource:
        numberedAmongSameSource ?? entry.numberedAmongSameSource ?? repeatsInSource(entry.name),
      sourceHash: hash(text),
      ...(text === ''
        ? {}
        : {
            anchorHash: nameFreeHash(text, entry.name),
            declarationHash: hash(entry.signature ?? declarationLine(text)),
          }),
    };
  });
  return evaluateStructure(
    { functions },
    STRUCTURE_TOOL,
    hints === undefined ? {} : { hints },
  ).filter((finding) => finding.classification === 'enforceable');
}

export function sourceLines(sources: SourceCache, projectRoot: string, file: string): string[] {
  const cached = sources.get(file);
  if (cached !== undefined) {
    return cached;
  }
  const base = path.resolve(projectRoot);
  const full = path.resolve(base, file);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`Source path escapes the project: ${file}`);
  }
  const lines = readFileSync(full, 'utf8').split(/\r?\n/);
  sources.set(file, lines);
  return lines;
}

export function methodText(
  sources: SourceCache,
  projectRoot: string,
  { file, start, end }: SourceRange,
): string {
  return sourceLines(sources, projectRoot, file)
    .slice(start - 1, end)
    .map((line) => line.trim())
    .join('\n');
}
