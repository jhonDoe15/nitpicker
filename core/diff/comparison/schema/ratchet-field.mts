import type { Ratchet } from '../model/finding-types.mts';
import { parseLineRanges } from './not-run-fields.mts';
import { finiteNumber, positiveInteger, requiredRecord, requiredString } from './values.mts';

const RATCHET_TEXT_FIELDS = [
  'declarationKey',
  'worseMessage',
  'worseAllowedForm',
  'growthAdvice',
  'growthAllowedForm',
  'heldMessage',
];
const RATCHET_PARTS = [
  ['worseAllowedForm', 'worseMessage'],
  ['growthAllowedForm', 'growthAdvice'],
];
const RATCHET_FLAGS = ['existingCodeOnly', 'pathIsFolder', 'divisible'];

function ratchetTexts(
  value: Readonly<Record<string, unknown>>,
  context: string,
): Record<string, string> {
  return Object.fromEntries(
    RATCHET_TEXT_FIELDS.filter((name) => value[name] !== undefined).map((name) => [
      name,
      requiredString(value[name], `${context}.${name}`),
    ]),
  );
}

function checkRatchetParts(texts: Readonly<Record<string, string>>, context: string): void {
  for (const [part = '', whole = ''] of RATCHET_PARTS) {
    const partText = texts[part];
    if (partText !== undefined && !(texts[whole] ?? '').includes(partText)) {
      throw new TypeError(`${context}.${part} is not part of ${whole}`);
    }
  }
}

function ratchetFlags(
  value: Readonly<Record<string, unknown>>,
  context: string,
): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const name of RATCHET_FLAGS.filter((flag) => value[flag] !== undefined)) {
    const flag = value[name];
    if (typeof flag !== 'boolean') {
      throw new TypeError(`${context}.${name} must be a boolean`);
    }
    flags[name] = flag;
  }
  return flags;
}

export function parseRatchet(input: unknown, context: string): Ratchet {
  const value = requiredRecord(input, context);
  const ratchetValue = finiteNumber(value['value'], `${context}.value`);
  const ratchet: { -readonly [Field in keyof Ratchet]: Ratchet[Field] } = {
    key: requiredString(value['key'], `${context}.key`),
    value: ratchetValue,
  };
  if (value['folderFiles'] !== undefined) {
    ratchet.folderFiles = positiveInteger(value['folderFiles'], `${context}.folderFiles`);
  }
  const texts = ratchetTexts(value, context);
  Object.assign(ratchet, texts);
  checkRatchetParts(texts, context);
  Object.assign(ratchet, ratchetFlags(value, context));
  if (value['mustKeepUnchangedLines'] !== undefined) {
    ratchet.mustKeepUnchangedLines = parseLineRanges(
      value['mustKeepUnchangedLines'],
      `${context}.mustKeepUnchangedLines`,
    );
  }
  return ratchet;
}
