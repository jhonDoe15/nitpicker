import { escapeRegExp } from '../typed/typed-scan.mts';
import { closingIndex, enclosingOpen } from '../kotlin-source.mts';
import { loopBodies } from '../loops.mts';
import type { Ruled, Scanned } from '../typed/scan-shapes.mts';

const LOOKUP =
  /(?<![\w.])(this\s*\.\s*)?([A-Za-z_]\w*)\s*\.\s*(?:find|firstOrNull|first|any|none|indexOfFirst|singleOrNull)\s*\{/g;
const LAMBDA_PARAMETER = /^\s*([A-Za-z_]\w*)\s*$/;
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

function lambdaParts(body: string): { parameter: string; expression: string } | undefined {
  const arrow = body.indexOf('->');
  const parameter = arrow === -1 ? undefined : LAMBDA_PARAMETER.exec(body.slice(0, arrow));
  if (/[{}]/.test(body)) {
    return undefined;
  }
  return parameter === undefined || parameter === null
    ? { parameter: 'it', expression: body.trim() }
    : { parameter: parameter[1] ?? '', expression: body.slice(arrow + 2).trim() };
}

function keyOf(side: string, parameter: string): string | undefined {
  const key = new RegExp(String.raw`^${escapeRegExp(parameter)}\s*(?:\?|!!)?\.([\w.?!\s]+)$`);
  return key.exec(side)?.[1];
}

function lookupKey(body: string): string | undefined {
  const lambda = lambdaParts(body);
  const sides = lambda?.expression.split('==') ?? [];
  const [first = '', second = ''] = sides;
  if (lambda === undefined || sides.length !== 2 || /&&|\|\||!$|[<>]$/.test(first)) {
    return undefined;
  }
  const { parameter } = lambda;
  const left = first.trim();
  const right = second.trim();
  const mentions = new RegExp(String.raw`(?<![\w.])${escapeRegExp(parameter)}\b`);
  const candidates: [string | undefined, string][] = [
    [keyOf(left, parameter), right],
    [keyOf(right, parameter), left],
  ];
  const keyed = candidates.find(
    ([key, other]) => key !== undefined && !mentions.test(other) && !CONSTANT.test(other),
  );
  return keyed?.[0]?.replaceAll(/\s/g, '');
}

function scopeAfter(code: string, from: number): { start: number; end: number } {
  const open = code.indexOf('{', from);
  return { start: from, end: open === -1 ? code.length : closingIndex(code, open) };
}

function declarationOf(
  code: string,
  name: string,
  offset: number,
): { start: number; end: number; mutable: boolean } | undefined {
  const before = code.slice(0, offset);
  const escaped = escapeRegExp(name);
  const declarations = [
    ...before.matchAll(new RegExp(String.raw`\b(val|var)\s+${escaped}\b`, 'g')),
  ];
  const parameters = [
    ...before.matchAll(
      new RegExp(String.raw`[(,]\s*(?:(?:private|internal|val)\s+)*${escaped}\s*:`, 'g'),
    ),
  ];
  const local = declarations.findLast(({ index }) => {
    const open = enclosingOpen(code, index);
    return open === -1 || closingIndex(code, open) > offset;
  });
  if (local !== undefined) {
    const open = enclosingOpen(code, local.index);
    const end = open === -1 ? code.length : closingIndex(code, open);
    return { start: local.index, end, mutable: local[1] === 'var' };
  }
  const parameter = parameters
    .map(({ index }) => scopeAfter(code, index))
    .findLast(({ end }) => end > offset);
  return parameter === undefined ? undefined : { ...parameter, mutable: false };
}

function isChanged(code: string, name: string): boolean {
  const receiver = String.raw`(?<![\w.])(?<!\b(?:val|var)\s+)(?:this\s*\.\s*)?${escapeRegExp(name)}`;
  return new RegExp(
    String.raw`${receiver}\s*(?:\??\.\s*(?:${MUTATORS.join('|')})\s*\(|(?:\+|-)?=(?!=)|\[[^\]]*\]\s*=(?!=))`,
  ).test(code);
}

export function keyedLookups(scanned: Scanned): Ruled[] {
  const { code } = scanned;
  const loops = loopBodies(code);
  return [...code.matchAll(LOOKUP)].flatMap((match) => {
    const name = match[2] ?? '';
    const open = match.index + match[0].length - 1;
    const key = lookupKey(code.slice(open + 1, closingIndex(code, open)));
    const declaration = key === undefined ? undefined : declarationOf(code, name, match.index);
    const scope = declaration === undefined ? '' : code.slice(declaration.start, declaration.end);
    if (declaration === undefined || declaration.mutable || isChanged(scope, name)) {
      return [];
    }
    const repeated = loops.some(
      (loop) =>
        loop.open > declaration.start &&
        loop.open < match.index &&
        match.index < loop.close &&
        !loop.variables.includes(name),
    );
    return repeated ? [{ rule: 'LinearLookupInLoop', offset: match.index }] : [];
  });
}
