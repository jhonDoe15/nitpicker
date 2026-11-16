import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, listOf, messageOf, parseJson, textOf } from '../../../shared/values/readers.mts';
import { jscpdClones as untypedJscpdClones } from './jscpd-clones.mjs';
import { withoutImportOnlyClones as untypedWithoutImportOnly } from './import-only.mjs';
import { DUPLICATES_REPORT, runJscpd as untypedRunJscpd } from './run-jscpd.mjs';

export type DuplicateClone = Readonly<Record<string, unknown>>;

export type DuplicateScan = {
  readonly cwd: string;
  readonly roots: readonly string[];
  readonly format: string;
  readonly ignore: readonly string[];
  readonly reportRoot: string;
  readonly together: boolean;
  readonly renamed: { readonly syntax: string; readonly files: readonly string[] };
};

const runJscpd: (options: DuplicateScan) => void = untypedRunJscpd;
const jscpdClones: (report: unknown, configuredPaths: string[]) => DuplicateClone[] =
  untypedJscpdClones;
const withoutImportOnlyClones: (clones: DuplicateClone[], format: string) => DuplicateClone[] =
  untypedWithoutImportOnly;

export function runDuplicateScan(scan: DuplicateScan, rule: string): void {
  try {
    runJscpd(scan);
  } catch (error) {
    throw Object.assign(new Error(messageOf(error), { cause: error }), { rule });
  }
}

export function readDuplicateClones(reportRoot: string, syntax: string): DuplicateClone[] {
  const parsed = parseJson(readFileSync(path.join(reportRoot, DUPLICATES_REPORT), 'utf8'));
  const clones = listOf(fieldOf(parsed, 'runs')).flatMap((entry) =>
    jscpdClones(fieldOf(entry, 'report'), [textOf(fieldOf(entry, 'root'))]),
  );
  return withoutImportOnlyClones(clones, syntax);
}
