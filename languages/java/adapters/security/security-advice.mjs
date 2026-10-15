import { ADVICE_GROUPS } from './advice-groups.mjs';

const ADVICE = new Map(
  ADVICE_GROUPS.flatMap(({ patterns, text }) => patterns.map((pattern) => [pattern, text])),
);

export function securityPatterns() {
  return [...ADVICE.keys()];
}

export function securityMessage(pattern) {
  const advice = ADVICE.get(pattern);
  return advice === undefined
    ? undefined
    : `${advice} If it is right here, add an exception for spotbugs/${pattern} in nitpicker.config.json.`;
}

export function stableName(name) {
  return name.replace(/\$\d+(?![A-Za-z_])/g, '');
}

export function enclosingMethod(result) {
  const name = result.locations?.[0]?.logicalLocations?.[0]?.fullyQualifiedName;
  return name === undefined ? undefined : stableName(name.replace(/\(.*$/, ''));
}

export function securitySubject(result, fallback) {
  return ADVICE.has(result.ruleId) ? [fallback, enclosingMethod(result)].join(' ') : fallback;
}

export function withSecurityMessages(log) {
  return {
    ...log,
    runs: (log.runs ?? []).map((run) => ({
      ...run,
      results: (run.results ?? []).map((result) => {
        const text = securityMessage(result.ruleId);
        return text === undefined ? result : { ...result, message: { ...result.message, text } };
      }),
    })),
  };
}

const REDUNDANT_ON_SITE = {
  CIPHER_INTEGRITY: ['DES_USAGE', 'TDES_USAGE', 'ECB_MODE', 'BLOWFISH_KEY_SIZE', 'PADDING_ORACLE'],
  PADDING_ORACLE: ['DES_USAGE', 'TDES_USAGE', 'ECB_MODE', 'BLOWFISH_KEY_SIZE'],
};
const SQL_PATTERN = /^SQL_INJECTION/;
const PMD_QUERY_RULE = 'SpringQueryConcatenation';

function placeOf(result) {
  const location = result.locations?.[0]?.physicalLocation;
  const start = location?.region?.startLine ?? 0;
  return {
    uri: location?.artifactLocation?.uri ?? '',
    start,
    end: location?.region?.endLine ?? start,
  };
}

function resultsOf(log) {
  return (log.runs ?? []).flatMap((run) => run.results ?? []);
}

function hasSiblingOnSite(result, results) {
  const { uri, start } = placeOf(result);
  return (REDUNDANT_ON_SITE[result.ruleId] ?? []).some((rule) =>
    results.some((other) => {
      const place = placeOf(other);
      return other.ruleId === rule && place.uri === uri && place.start === start;
    }),
  );
}

function coveredByQueryRule(result, ranges) {
  const { uri, start } = placeOf(result);
  return (
    SQL_PATTERN.test(result.ruleId) &&
    ranges.some(
      (range) => range.uri.endsWith(`/${uri}`) && start >= range.start - 1 && start <= range.end,
    )
  );
}

export function withoutDuplicateSites(log, pmdLog) {
  const ranges = resultsOf(pmdLog)
    .filter((result) => result.ruleId === PMD_QUERY_RULE)
    .map(placeOf);
  return {
    ...log,
    runs: (log.runs ?? []).map((run) => ({
      ...run,
      results: (run.results ?? []).filter(
        (result) => !hasSiblingOnSite(result, run.results) && !coveredByQueryRule(result, ranges),
      ),
    })),
  };
}
