import { configError } from '../../../../shared/config.mjs';
import { isPlainObject } from '../../views/config-views.mts';
import { isNonEmptyString } from '../../views/validation-views.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

const PROTOCOL_KEYS = ['type', 'open', 'close', 'steps', 'reason'];
const MEMBER_LISTS = ['open', 'close', 'steps'];

function validateMembers(entry: Record<string, unknown>, key: string, label: string): void {
  const members = entry[key];
  if (members === undefined && key === 'steps') {
    return;
  }
  if (!Array.isArray(members) || members.length === 0 || !members.every(isNonEmptyString)) {
    throw configError(`"${label}.${key}" must be a non-empty array of member names`);
  }
}

function validateProtocol(entry: unknown, label: string): void {
  if (!isPlainObject(entry)) {
    throw configError(`"${label}" must be an object`);
  }
  const unknown = Object.keys(entry).find((key) => !PROTOCOL_KEYS.includes(key));
  if (unknown !== undefined) {
    throw configError(
      `unknown key "${unknown}" in "${label}". Allowed keys: ${PROTOCOL_KEYS.join(', ')}`,
    );
  }
  if (!isNonEmptyString(entry['type'])) {
    throw configError(`"${label}.type" must name the type, such as "Session"`);
  }
  for (const key of MEMBER_LISTS) {
    validateMembers(entry, key, label);
  }
  if (entry['reason'] !== undefined && !isNonEmptyString(entry['reason'])) {
    throw configError(`"${label}.reason" must be a non-empty string`);
  }
}

export function validateProtocols(protocols: unknown): void {
  if (protocols === undefined) {
    return;
  }
  if (!Array.isArray(protocols)) {
    throw configError(
      '"protocols" must be an array of { type, open, close, steps?, reason? } entries',
    );
  }
  const types = new Set<unknown>();
  for (const [index, entry] of protocols.entries()) {
    validateProtocol(entry, `protocols[${String(index)}]`);
    if (types.has(fieldOf(entry, 'type'))) {
      throw configError(
        `"protocols[${String(index)}].type" repeats "${textOf(fieldOf(entry, 'type'))}": list each type's lifecycle once`,
      );
    }
    types.add(fieldOf(entry, 'type'));
  }
}
