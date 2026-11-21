import { existsSync } from 'node:fs';
import path from 'node:path';
import { ENGINE_SARIF } from '../../../../builds/rulesets/engine/pmd-engine.mts';
import { isRuleCrashText } from '../processing/pmd-rule-crashes.mts';
import type { SarifLog, SarifResult, SarifRun } from '../../../jpa/jpa-types.mts';
import { fieldOf, listOf, optionalText } from '../../../../../../shared/values/readers.mts';

type Place = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;
};

function fileOf(entry: unknown): string {
  const location = listOf(fieldOf(entry, 'locations'))[0];
  const physical = fieldOf(location, 'physicalLocation');
  return optionalText(fieldOf(fieldOf(physical, 'artifactLocation'), 'uri')) ?? '';
}

function placeOf(result: SarifResult): Place {
  const location = listOf(fieldOf(result, 'locations'))[0];
  const region = fieldOf(fieldOf(location, 'physicalLocation'), 'region');
  return {
    file: decodeURI(fileOf(result)),
    line: Number(fieldOf(region, 'startLine') ?? 0),
    column: Number(fieldOf(region, 'startColumn') ?? 0),
    text: optionalText(fieldOf(result.message, 'text')) ?? '',
  };
}

function ordered(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function inReportOrder(left: SarifResult, right: SarifResult): number {
  const [first, second] = [placeOf(left), placeOf(right)];
  return (
    ordered(first.file, second.file) ||
    first.line - second.line ||
    first.column - second.column ||
    ordered(first.text, second.text)
  );
}

function unreadFiles(pmd: SarifLog): Set<string> {
  const notes = (pmd.runs ?? []).flatMap((run) =>
    listOf(fieldOf(run, 'invocations')).flatMap((invocation) =>
      listOf(fieldOf(invocation, 'toolExecutionNotifications')),
    ),
  );
  return new Set(
    notes
      .filter((note) => !isRuleCrashText(optionalText(fieldOf(fieldOf(note, 'message'), 'text')) ?? ''))
      .map((note) => decodeURI(fileOf(note))),
  );
}

export function withEngineResults(pmd: SarifLog, engine: SarifLog): SarifLog {
  const unread = unreadFiles(pmd);
  const added = (engine.runs ?? [])
    .flatMap((run) => run.results ?? [])
    .filter((result) => !unread.has(decodeURI(fileOf(result))));
  const [first, ...rest] = pmd.runs ?? [];
  const base: SarifRun = first ?? engine.runs?.[0] ?? {};
  return {
    ...pmd,
    runs: [{ ...base, results: [...(first?.results ?? []), ...added].toSorted(inReportOrder) }, ...rest],
  };
}

export function readPmdReport(reportRoot: string, read: (file: string) => SarifLog): SarifLog {
  const pmd = read(path.join(reportRoot, 'pmd.sarif'));
  const engine = path.join(reportRoot, ENGINE_SARIF);
  return existsSync(engine) ? withEngineResults(pmd, read(engine)) : pmd;
}
