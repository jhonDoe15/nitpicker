import path from 'node:path';
import { SPOTBUGS_ENGINE_SARIF } from '../../../../builds/spotbugs/spotbugs-engine.mts';
import { classOf } from '../../../../builds/spotbugs/names/spotbugs-names.mts';
import { byText } from '../../../../../../shared/text-order/by-text.mts';
import { firstDifference, withEngineReport } from './engine-report.mts';
import type { SarifLog, SarifResult } from '../../../jpa/jpa-types.mts';
import {
  fieldOf,
  listOf,
  optionalText,
  textsOf,
} from '../../../../../../shared/values/readers.mts';

type Place = readonly [string, string, string, string, number];

const CONSTRUCTOR_THROW = 'CT_CONSTRUCTOR_THROW';
const CONSTRUCTOR = 'new ';

function methodName(method: string): string {
  const signature = method.slice(0, Math.max(method.indexOf('('), 0));
  return signature.startsWith(CONSTRUCTOR)
    ? '<init>'
    : signature.slice(signature.lastIndexOf('.') + 1);
}

function placeOf(result: SarifResult): Place {
  const rule = optionalText(fieldOf(result, 'ruleId')) ?? '';
  const [first = '', second = ''] = textsOf(fieldOf(result.message, 'arguments'));
  const location = listOf(fieldOf(result, 'locations'))[0];
  const line = Number(
    fieldOf(fieldOf(fieldOf(location, 'physicalLocation'), 'region'), 'startLine') ?? 0,
  );
  return rule === CONSTRUCTOR_THROW
    ? [first, rule, methodName(second), second, line]
    : [classOf(first), rule, methodName(first), `${first} ${second}`, line];
}

function inReportOrder(left: SarifResult, right: SarifResult): number {
  const [first, second] = [placeOf(left), placeOf(right)];
  return firstDifference([
    byText(first[0], second[0]),
    byText(first[1], second[1]),
    byText(first[2], second[2]),
    byText(first[3], second[3]),
    first[4] - second[4],
  ]);
}

export function withSpotbugsEngineResults(spotbugs: SarifLog, engine: SarifLog): SarifLog {
  const [first, ...rest] = spotbugs.runs ?? [];
  if (first === undefined) {
    return spotbugs;
  }
  const added = (engine.runs ?? []).flatMap((run) => run.results ?? []);
  return {
    ...spotbugs,
    runs: [
      { ...first, results: [...(first.results ?? []), ...added.toSorted(inReportOrder)] },
      ...rest,
    ],
  };
}

export function readSpotbugsReport(reportRoot: string, read: (file: string) => SarifLog): SarifLog {
  return withEngineReport(
    {
      own: path.join(reportRoot, 'spotbugs.sarif'),
      engine: path.join(reportRoot, SPOTBUGS_ENGINE_SARIF),
      merge: withSpotbugsEngineResults,
    },
    read,
  );
}
