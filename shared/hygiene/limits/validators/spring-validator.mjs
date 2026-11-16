import { makeFact } from '../scanning/facts.mjs';
import { blankComments, lineAt } from '../scanning/scan.mjs';

const SUPPORTS =
  /(\w+)\.class\s*\.\s*isAssignableFrom|isAssignableFrom\(\s*(\w+)\.class|(\w+)\.class\.equals/u;
const ASSIGNED = /\b(\w+)\s*=\s*\w+\.get(\w+)\(\)\s*;|\bval\s+(\w+)\s*=\s*\w+\.(\w+)\b/gu;
const LENGTH_CHECK =
  /(?:(\w+)|\w+\.get(\w+)\(\)|\w+\.(\w+))\s*\.\s*length(?:\(\))?\s*(>=|>|<=|<)\s*(\d+)/gu;
const IS_VALIDATOR = /\bValidator\b/u;

function lowerFirst(name) {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function springValidatorFacts(file, source) {
  const text = blankComments(source);
  if (!IS_VALIDATOR.test(text)) {
    return [];
  }
  const target = SUPPORTS.exec(text);
  const entity = target?.[1] ?? target?.[2] ?? target?.[3];
  if (entity === undefined) {
    return [];
  }
  const fields = new Map(
    [...text.matchAll(ASSIGNED)].map((match) => [
      match[1] ?? match[3],
      lowerFirst(match[2] ?? match[4]),
    ]),
  );
  return [...text.matchAll(LENGTH_CHECK)].flatMap((check) => {
    const field = fields.get(check[1]) ?? lowerFirst(check[2] ?? check[3] ?? '');
    const limit = Number(check[5]);
    const max = { '>': limit, '>=': limit - 1 }[check[4]];
    return field === '' || (check[1] !== undefined && !fields.has(check[1])) || max === undefined
      ? []
      : [
          makeFact({
            kind: 'validation',
            entityNames: [entity],
            fieldNames: [field],
            label: `${entity}.${field}`,
            file,
            line: lineAt(text, check.index),
            style: 'jvm',
            bounds: { max },
          }),
        ];
  });
}
