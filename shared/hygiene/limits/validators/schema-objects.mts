import { makeFact } from '../scanning/facts.mts';
import {
  blankComments,
  closingIndex,
  lineAt,
  parseArguments,
  splitTopLevel,
} from '../scanning/scan.mts';
import { annotationBounds, combineBounds, hasBounds, isUnresolved, number } from './bounds.mts';
import type { Bounds, Fact, ParsedArguments } from '../fact-types.mts';

const NAMESPACES = 'z|v|yup|Joi|valibot|Yup';
const OBJECT = new RegExp(
  [
    String.raw`\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:[\w.]*\.)?`,
    String.raw`(?:${NAMESPACES})\.(?:strict|loose)?[oO]bject\(\s*(?:\)\s*\.shape\(\s*)?\{`,
  ].join(''),
  'gu',
);
const PROPERTY = /^\s*['"]?(\w+)['"]?\s*:/u;
const MATCHES = 'matches';
const CALL = /(?:\bv\.|\.)(maxLength|minLength|length|maxValue|max|min|regex|pattern|matches)\(/gu;
const NUMBER = /\bnumber\(|\bint\(|\binteger\(/u;
const TEXT: Readonly<Record<string, (args: ParsedArguments) => Bounds>> = {
  max: ({ positional: [value] }) => ({ max: number(value) }),
  maxlength: ({ positional: [value] }) => ({ max: number(value) }),
  min: ({ positional: [value] }) => ({ min: number(value) }),
  minlength: ({ positional: [value] }) => ({ min: number(value) }),
  length: ({ positional: [value] }) => ({ min: number(value), max: number(value) }),
  regex: (args) => annotationBounds(MATCHES, args),
  pattern: (args) => annotationBounds(MATCHES, args),
  matches: (args) => annotationBounds(MATCHES, args),
};
const NUMERIC = ['max', 'maxvalue'];

function callBounds(name: string, args: ParsedArguments, numeric: boolean): Bounds {
  if (!numeric) {
    const text = Object.hasOwn(TEXT, name) ? TEXT[name] : undefined;
    return text === undefined ? {} : text(args);
  }
  return NUMERIC.includes(name) ? { maximum: number(args.positional[0]) } : {};
}

function chainBounds(chain: string): Bounds[] {
  const numeric = NUMBER.test(chain);
  return [...chain.matchAll(CALL)].map((call) => {
    const open = call.index + call[0].length - 1;
    const args = parseArguments(chain.slice(open + 1, closingIndex(chain, open)));
    const name = (call[1] ?? '').toLowerCase();
    const bounds = callBounds(name, args, numeric);
    return isUnresolved(args) ? { ...bounds, unresolved: true } : bounds;
  });
}

export function schemaObjectFacts(file: string, source: string): Fact[] {
  const text = blankComments(source);
  return [...text.matchAll(OBJECT)].flatMap((object) => {
    const open = object.index + object[0].length - 1;
    const body = text.slice(open + 1, closingIndex(text, open));
    return splitTopLevel(body).flatMap(({ text: property, offset }) => {
      const field = PROPERTY.exec(property);
      if (field === null) {
        return [];
      }
      const bounds = combineBounds(chainBounds(property.slice(field[0].length)));
      return hasBounds(bounds)
        ? [
            makeFact({
              kind: 'validation',
              entityNames: [object[1]],
              fieldNames: [field[1]],
              label: `${object[1] ?? ''}.${field[1] ?? ''}`,
              file,
              line: lineAt(text, open + 1 + offset + property.search(/\S/u)),
              style: 'schema',
              bounds,
            }),
          ]
        : [];
    });
  });
}
