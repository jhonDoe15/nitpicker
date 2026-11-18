import type { SarifLog, SarifResult, SarifRun } from '../../jpa/jpa-types.mts';
import { fieldOf, fieldsOf, listOf } from '../../../../../shared/values/readers.mts';

function withoutLevel(entry: SarifResult): SarifResult {
  const { level, ...rest } = entry;
  return level === 'error' ? entry : rest;
}

function withoutDefaultLevel(rule: unknown): unknown {
  const { level, ...rest } = fieldsOf(fieldOf(rule, 'defaultConfiguration'));
  if (level === undefined || level === 'error') {
    return rule;
  }
  return { ...fieldsOf(rule), defaultConfiguration: rest };
}

function withoutRunLevels(run: SarifRun): SarifRun {
  const tool = fieldsOf(run['tool']);
  const driver = fieldsOf(tool['driver']);
  return {
    ...run,
    results: (run.results ?? []).map(withoutLevel),
    ...(driver['rules'] === undefined
      ? {}
      : {
          tool: {
            ...tool,
            driver: { ...driver, rules: listOf(driver['rules']).map(withoutDefaultLevel) },
          },
        }),
  };
}

export function withPmdLevels(log: SarifLog): SarifLog {
  return {
    ...log,
    runs: (log.runs ?? []).map(withoutRunLevels),
  };
}
