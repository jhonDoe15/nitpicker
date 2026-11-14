import {
  headTestFailuresOf,
  mutationFailuresOf,
  unknownMutantsFor,
  unknownOnBaseFor,
} from './unknown-base.mjs';
import type { AnalyzerReport, Finding } from '../../../../shared/values/findings.mts';

type FindingTest = (finding: Finding) => boolean;

type ReportsRun = { readonly reports: ReadonlyMap<string, AnalyzerReport> };

const unknownOnBase: (
  failures: readonly Finding[],
  touchedCode: unknown,
) => FindingTest | undefined = unknownOnBaseFor;
const mutationFailures: (report: AnalyzerReport | undefined) => readonly Finding[] =
  mutationFailuresOf;
const headTestFailures: (report: AnalyzerReport | undefined, name: string) => readonly Finding[] =
  headTestFailuresOf;
const unknownMutants: (
  failures: readonly Finding[],
  touchedCode?: unknown,
) => FindingTest | undefined = unknownMutantsFor;

function eitherOf(
  first: FindingTest | undefined,
  second: FindingTest | undefined,
): FindingTest | undefined {
  return first === undefined || second === undefined
    ? (first ?? second)
    : (finding) => first(finding) || second(finding);
}

export function unknownOnBaseOf({
  name,
  baseRun,
  touchedCode,
  unknownFailures,
}: {
  readonly name: string;
  readonly baseRun: ReportsRun;
  readonly touchedCode?: unknown;
  readonly unknownFailures: readonly Finding[] | undefined;
}): FindingTest | undefined {
  return eitherOf(
    unknownFailures === undefined ? undefined : unknownOnBase(unknownFailures, touchedCode),
    unknownMutants(mutationFailures(baseRun.reports.get(name)), touchedCode),
  );
}

function withoutUnmeasured(
  findings: readonly Finding[],
  unmeasured: FindingTest | undefined,
): readonly Finding[] {
  return unmeasured === undefined ? findings : findings.filter((finding) => !unmeasured(finding));
}

export function withoutUnmeasuredMutants(
  baseFindings: readonly Finding[],
  { name, headRun }: { readonly name: string; readonly headRun: ReportsRun },
): readonly Finding[] {
  const headReport = headRun.reports.get(name);
  return withoutUnmeasured(
    baseFindings,
    eitherOf(
      unknownMutants(mutationFailures(headReport)),
      unknownOnBase(headTestFailures(headReport, name), undefined),
    ),
  );
}

export function withoutHeadUnmeasured(
  headFindings: readonly Finding[],
  { name, headRun }: { readonly name: string; readonly headRun: ReportsRun },
): readonly Finding[] {
  return withoutUnmeasured(
    headFindings,
    unknownOnBase(headTestFailures(headRun.reports.get(name), name), undefined),
  );
}
