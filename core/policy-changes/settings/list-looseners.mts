import { fieldOf, listOf, textsOf } from '../../../shared/values/readers.mts';
import type { SettingValues } from '../types/policy-types.mts';

export function listShrank({ before, after }: SettingValues): boolean {
  const kept = new Set(listOf(after).map((entry) => JSON.stringify(entry)));
  return listOf(before).some((entry) => !kept.has(JSON.stringify(entry)));
}

function lost(before: unknown, after: unknown): boolean {
  const kept = textsOf(after);
  return textsOf(before).some((name) => !kept.includes(name));
}

function contractLoosened(before: unknown, after: unknown): boolean {
  return (
    after === undefined ||
    lost(fieldOf(before, 'open'), fieldOf(after, 'open')) ||
    lost(fieldOf(after, 'close'), fieldOf(before, 'close')) ||
    lost(fieldOf(before, 'steps'), fieldOf(after, 'steps'))
  );
}

export function protocolsLoosened({ before, after }: SettingValues): boolean {
  const heads = new Map(listOf(after).map((contract) => [fieldOf(contract, 'type'), contract]));
  return listOf(before).some((contract) =>
    contractLoosened(contract, heads.get(fieldOf(contract, 'type'))),
  );
}

export function listGrew({ before, after }: SettingValues): boolean {
  const earlier = listOf(before);
  return listOf(after).some((entry) => !earlier.includes(entry));
}

export function formattersDropped({ before, after }: SettingValues): boolean {
  const kept = textsOf(after);
  return textsOf(before).some((formatter) =>
    formatter === 'gofmt' ? kept.length === 0 : !kept.includes(formatter),
  );
}
