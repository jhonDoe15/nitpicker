import { makeFact } from '../scanning/facts.mjs';
import { blankComments, closingIndex, lineAt } from '../scanning/scan.mjs';

const STRUCT = /\btype\s+(\w+)\s+struct\s*\{/gu;
const FIELD = /^\s*(\w+)\s+([\w.*[\]]+)\s+`([^`]*)`/u;
const TABLE_NAME =
  /func\s*\(\s*(?:\w+\s+)?\*?(\w+)\s*\)\s*TableName\(\)\s*string\s*\{\s*return\s*"(\w+)"/gu;
const COLUMN_PREFIX = 'column:';
const GORM = /\bgorm:"([^"]*)"/u;
const RULES = /\b(?:validate|binding):"([^"]*)"/u;
const JSON_NAME = /\bjson:"(\w+)/u;
const NUMERIC = /^\*?(?:u?int\d*|float\d*)$/u;

function gormWidth(tag) {
  const parts = (GORM.exec(tag)?.[1] ?? '').split(';').map((part) => part.trim());
  const size = parts.find((part) => /^size:\d+$/u.test(part));
  const typed = parts
    .map((part) => /^type:(?:varchar|char)\((\d+)\)/iu.exec(part)?.[1])
    .find(Boolean);
  const found = size?.slice('size:'.length) ?? typed;
  return found === undefined ? undefined : Number(found);
}

function gormColumn(tag) {
  return (GORM.exec(tag)?.[1] ?? '')
    .split(';')
    .find((part) => part.trim().startsWith(COLUMN_PREFIX))
    ?.trim()
    .slice(COLUMN_PREFIX.length);
}

const TEXT_RULES = {
  max: (value) => ({ max: value }),
  lte: (value) => ({ max: value }),
  min: (value) => ({ min: value }),
  gte: (value) => ({ min: value }),
  len: (value) => ({ min: value, max: value }),
};
const NUMBER_RULES = { max: (value) => ({ maximum: value }), lte: (value) => ({ maximum: value }) };

function ruleBounds(tag, type) {
  const rules = NUMERIC.test(type) ? NUMBER_RULES : TEXT_RULES;
  const parts = (RULES.exec(tag)?.[1] ?? '').split(',').map((rule) => rule.trim().split('='));
  return Object.assign(
    {},
    ...parts.map(([name, value]) =>
      /^\d+$/u.test(value ?? '') && Object.hasOwn(rules, name) ? rules[name](Number(value)) : {},
    ),
  );
}

export function goFacts(file, source) {
  const text = blankComments(source);
  const tables = new Map([...text.matchAll(TABLE_NAME)].map((match) => [match[1], match[2]]));
  return [...text.matchAll(STRUCT)].flatMap((entity) => {
    const open = entity.index + entity[0].length - 1;
    const body = text.slice(open + 1, closingIndex(text, open));
    return body.split('\n').flatMap((line, offset) => {
      const field = FIELD.exec(line);
      if (field === null) {
        return [];
      }
      const [, name, type, tag] = field;
      const bounds = ruleBounds(tag, type);
      const width = NUMERIC.test(type) ? undefined : gormWidth(tag);
      const names = {
        entityNames: [entity[1], tables.get(entity[1])],
        fieldNames: [name, gormColumn(tag), JSON_NAME.exec(tag)?.[1]],
        label: `${entity[1]}.${name}`,
        file,
        line: lineAt(text, open + 1) + offset,
        style: 'go',
      };
      return [
        ...(GORM.test(tag) ? [makeFact({ ...names, kind: 'field' })] : []),
        ...(width === undefined ? [] : [makeFact({ ...names, kind: 'column', width })]),
        ...(Object.keys(bounds).length === 0
          ? []
          : [makeFact({ ...names, kind: 'validation', bounds })]),
      ];
    });
  });
}
