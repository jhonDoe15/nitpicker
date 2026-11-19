import { ADVICE_GROUPS } from './advice-groups.mts';
import { fieldOf, numberOr } from '../../../../shared/values/readers.mts';
import type { SarifLog, SarifResult, SarifRun } from '../jpa/jpa-types.mts';

type Place = { uri: string; start: number; end: number };

const ADVICE = new Map(
  ADVICE_GROUPS.flatMap(({ patterns, text }) =>
    patterns.map((pattern): [string, string] => [pattern, text]),
  ),
);

export function securityPatterns(): string[] {
  return [...ADVICE.keys()];
}

export function securityMessage(pattern: string | undefined): string | undefined {
  return pattern === undefined ? undefined : ADVICE.get(pattern);
}

export function stableName(name: string): string {
  return name.replace(/\$\d+(?![A-Za-z_])/g, '');
}

export function enclosingMethod(result: SarifResult): string | undefined {
  const name = result.locations?.[0]?.logicalLocations?.[0]?.fullyQualifiedName;
  return name === undefined ? undefined : stableName(name.replace(/\(.*$/, ''));
}

export function securitySubject(
  result: SarifResult,
  fallback: string | undefined,
): string | undefined {
  return securityMessage(result.ruleId) === undefined
    ? fallback
    : [fallback, enclosingMethod(result)].join(' ');
}

function runsOf(log: SarifLog): readonly SarifRun[] {
  return log.runs ?? [];
}

function withRunResults(
  log: SarifLog,
  change: (results: readonly SarifResult[]) => readonly SarifResult[],
): SarifLog {
  return {
    ...log,
    runs: runsOf(log).map((run) => ({ ...run, results: change(run.results ?? []) })),
  };
}

export function withSecurityMessages(log: SarifLog): SarifLog {
  return withRunResults(log, (results) =>
    results.map((result) => {
      const text = securityMessage(result.ruleId);
      return text === undefined ? result : { ...result, message: { ...result.message, text } };
    }),
  );
}

const REDUNDANT_ON_SITE: Record<string, string[] | undefined> = {
  CIPHER_INTEGRITY: ['DES_USAGE', 'TDES_USAGE', 'ECB_MODE', 'BLOWFISH_KEY_SIZE', 'PADDING_ORACLE'],
  PADDING_ORACLE: ['DES_USAGE', 'TDES_USAGE', 'ECB_MODE', 'BLOWFISH_KEY_SIZE'],
};
const SQL_PATTERN = /^SQL_INJECTION/;
const PMD_QUERY_RULE = 'SpringQueryConcatenation';

function placeOf(result: SarifResult): Place {
  const location = result.locations?.[0]?.physicalLocation;
  const start = numberOr(fieldOf(location?.region, 'startLine'), 0);
  return {
    uri: location?.artifactLocation?.uri ?? '',
    start,
    end: numberOr(fieldOf(location?.region, 'endLine'), start),
  };
}

function resultsOf(log: SarifLog): SarifResult[] {
  return runsOf(log).flatMap((run) => run.results ?? []);
}

function hasSiblingOnSite(result: SarifResult, results: readonly SarifResult[]): boolean {
  const { uri, start } = placeOf(result);
  return (REDUNDANT_ON_SITE[result.ruleId ?? ''] ?? []).some((rule) =>
    results.some((other) => {
      const place = placeOf(other);
      return other.ruleId === rule && place.uri === uri && place.start === start;
    }),
  );
}

function coveredByQueryRule(result: SarifResult, ranges: readonly Place[]): boolean {
  const { uri, start } = placeOf(result);
  return (
    SQL_PATTERN.test(result.ruleId ?? '') &&
    ranges.some(
      (range) => range.uri.endsWith(`/${uri}`) && start >= range.start - 1 && start <= range.end,
    )
  );
}

export function withoutDuplicateSites(log: SarifLog, pmdLog: SarifLog): SarifLog {
  const ranges = resultsOf(pmdLog)
    .filter((result) => result.ruleId === PMD_QUERY_RULE)
    .map(placeOf);
  return withRunResults(log, (results) =>
    results.filter(
      (result) => !(hasSiblingOnSite(result, results) || coveredByQueryRule(result, ranges)),
    ),
  );
}
