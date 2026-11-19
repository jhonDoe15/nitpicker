import { blankComments } from './scan.mjs';

const ENUM = /\benum\s+(?:class\s+)?(\w+)/gu;

export function enumNames(source) {
  return [...blankComments(source).matchAll(ENUM)].map((match) => match[1]);
}

export function isEnumField(field, enums) {
  const base = field.type.split('.').at(-1);
  return enums.has(base) || (field.annotations ?? []).some(({ name }) => name === 'Enumerated');
}
