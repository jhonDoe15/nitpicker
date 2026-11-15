import { diagnosticFindings as untypedDiagnosticFindings } from '../build/diagnostics.mjs';
import { vetFindings as untypedVetFindings } from '../build/go-vet.mjs';
import { unreachableFindings as untypedUnreachableFindings } from '../dead-code/go-deadcode.mjs';
import { tidyFindings as untypedTidyFindings } from '../dead-code/go-mod-tidy.mjs';
import { raceUnavailable as untypedRaceUnavailable } from '../race/race-run.mjs';
import { withoutGatedForeignKeys as untypedWithoutGatedForeignKeys } from '../lint/foreign-keys/key-gate.mjs';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import { callUntyped as call } from '../../../../shared/values/boundaries/untyped-call.mts';
import { isRow } from './row-readers.mts';
import type { FindingRow } from '../go-types.mts';

export function diagnosticFindings(
  projectRoot: string,
  diagnostics: readonly object[],
): FindingRow[] {
  return listOf(call(untypedDiagnosticFindings, projectRoot, diagnostics)).filter(isRow);
}

export function vetFindings(projectRoot: string, text: string): FindingRow[] {
  return listOf(call(untypedVetFindings, projectRoot, text)).filter(isRow);
}

export function unreachableFindings(
  projectRoot: string,
  packages: unknown,
  options: object,
): FindingRow[] {
  return listOf(call(untypedUnreachableFindings, projectRoot, packages, options)).filter(isRow);
}

export type KeyDiagnostic = { tool: string; rule: string; file: string; line: number };

function isDiagnostic(value: unknown): value is KeyDiagnostic {
  return typeof fieldOf(value, 'rule') === 'string';
}

export function withoutGatedForeignKeys(
  projectRoot: string,
  diagnostics: readonly KeyDiagnostic[],
): KeyDiagnostic[] {
  return listOf(call(untypedWithoutGatedForeignKeys, projectRoot, diagnostics)).filter(
    isDiagnostic,
  );
}

export function raceUnavailable(result: object): string | undefined {
  const reason: unknown = call(untypedRaceUnavailable, result);
  return typeof reason === 'string' ? reason : undefined;
}

export function tidyFindings(projectRoot: string, text: string): FindingRow[] {
  return listOf(call(untypedTidyFindings, projectRoot, text)).filter(isRow);
}
