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

export function enclosingMethod(result) {
  return result.locations?.[0]?.logicalLocations?.[0]?.fullyQualifiedName;
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
