import { configError, isNonEmptyString, isPlainObject } from '../../../shared/config.mjs';

const PROTOCOL_KEYS = ['type', 'open', 'close', 'steps', 'reason'];
const MEMBER_LISTS = ['open', 'close', 'steps'];

function validateMembers(entry, key, label) {
  const members = entry[key];
  if (members === undefined && key === 'steps') {
    return;
  }
  if (!Array.isArray(members) || members.length === 0 || !members.every(isNonEmptyString)) {
    throw configError(`"${label}.${key}" must be a non-empty array of member names`);
  }
}

function validateProtocol(entry, label) {
  if (!isPlainObject(entry)) {
    throw configError(`"${label}" must be an object`);
  }
  const unknown = Object.keys(entry).find((key) => !PROTOCOL_KEYS.includes(key));
  if (unknown !== undefined) {
    throw configError(
      `unknown key "${unknown}" in "${label}". Allowed keys: ${PROTOCOL_KEYS.join(', ')}`,
    );
  }
  if (!isNonEmptyString(entry.type)) {
    throw configError(`"${label}.type" must name the type, such as "Session"`);
  }
  for (const key of MEMBER_LISTS) {
    validateMembers(entry, key, label);
  }
  if (entry.reason !== undefined && !isNonEmptyString(entry.reason)) {
    throw configError(`"${label}.reason" must be a non-empty string`);
  }
}

export function validateProtocols(protocols) {
  if (protocols === undefined) {
    return;
  }
  if (!Array.isArray(protocols)) {
    throw configError(
      '"protocols" must be an array of { type, open, close, steps?, reason? } entries',
    );
  }
  for (const [index, entry] of protocols.entries()) {
    validateProtocol(entry, `protocols[${String(index)}]`);
  }
}
