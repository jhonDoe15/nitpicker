import { closingIndex, enclosingOpen } from '../kotlin-source.mjs';
import { loopBodies } from '../loops.mjs';

const LOOKUP =
  /(?<![\w.])(this\s*\.\s*)?([A-Za-z_]\w*)\s*\.\s*(?:find|firstOrNull|first|any|none|indexOfFirst|singleOrNull)\s*\{/g;
const LAMBDA = /^\s*(?:([A-Za-z_]\w*)\s*->)?([^{}]*?)\s*$/s;
const KEY = (parameter) => new RegExp(String.raw`^${parameter}\s*(?:\?|!!)?\.\s*([\w.?!\s]+)$`);
const CONSTANT = /^(?:["'\d]|(?:true|false|null)$|[A-Z]\w*\s*\.\s*[A-Z][A-Z0-9_]*$)/;
const MUTATORS = [
  'add',
  'addAll',
  'remove',
  'removeAll',
  'removeIf',
  'removeAt',
  'retainAll',
  'clear',
  'set',
  'sort',
  'sortBy',
  'sortWith',
  'replaceAll',
];

function lookupKey(body) {
  const lambda = LAMBDA.exec(body);
  const parameter = lambda?.[1] ?? 'it';
  const sides = lambda?.[2].split('==') ?? [];
  if (sides.length !== 2 || /&&|\|\||!$|[<>]$/.test(sides[0])) {
    return undefined;
  }
  const [left, right] = sides.map((side) => side.trim());
  const mentions = new RegExp(String.raw`(?<![\w.])${parameter}\b`);
  const keyed = [
    [KEY(parameter).exec(left), right],
    [KEY(parameter).exec(right), left],
  ].find(([key, other]) => key !== null && !mentions.test(other) && !CONSTANT.test(other));
  return keyed?.[0][1].replaceAll(/\s/g, '');
}

function declarationOf(code, name, offset) {
  const declarations = [
    ...code.slice(0, offset).matchAll(new RegExp(String.raw`\b(val|var)\s+${name}\b`, 'g')),
  ];
  const parameter = new RegExp(String.raw`[(,]\s*(?:(?:private|internal|val)\s+)*${name}\s*:`);
  const local = declarations.findLast(({ index }) => {
    const open = enclosingOpen(code, index);
    return open === -1 || closingIndex(code, open) > offset;
  });
  if (local !== undefined) {
    return { offset: local.index, mutable: local[1] === 'var' };
  }
  return parameter.test(code.slice(0, offset)) ? { offset: 0, mutable: false } : undefined;
}

function isChanged(code, name) {
  const receiver = String.raw`(?<![\w.])(?<!\b(?:val|var)\s+)(?:this\s*\.\s*)?${name}`;
  return new RegExp(
    String.raw`${receiver}\s*(?:\??\.\s*(?:${MUTATORS.join('|')})\s*\(|(?:\+|-)?=(?!=)|\[[^\]]*\]\s*=(?!=))`,
  ).test(code);
}

export function keyedLookups(scanned) {
  const { code } = scanned;
  const loops = loopBodies(code);
  return [...code.matchAll(LOOKUP)].flatMap((match) => {
    const name = match[2];
    const open = match.index + match[0].length - 1;
    const key = lookupKey(code.slice(open + 1, closingIndex(code, open)));
    const declaration = key === undefined ? undefined : declarationOf(code, name, match.index);
    if (declaration === undefined || declaration.mutable || isChanged(code, name)) {
      return [];
    }
    const repeated = loops.some(
      (loop) =>
        loop.open > declaration.offset &&
        loop.open < match.index &&
        match.index < loop.close &&
        !loop.variables.includes(name),
    );
    return repeated ? [{ rule: 'LinearLookupInLoop', offset: match.index }] : [];
  });
}
