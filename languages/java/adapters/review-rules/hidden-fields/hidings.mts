import { between, forward } from '../max-value-sums/source/source-file.mts';
import { declaresAt, inCaseLabel, namesDeclaredIn } from './declared-names.mts';
import { frameSpan, inside, ownIndexes, ownRegions, textAt } from './own-regions.mts';
import type { DeclaredName } from './declared-names.mts';
import type { Inherited } from './inherited-fields.mts';
import type { OwnFrame, OwnRegions } from './own-regions.mts';
import type { TypeDecl } from '../type-declarations/types.mts';
import type { SourceFile } from '../max-value-sums/sum-types.mts';

export type HidingKind = 'parameter' | 'variable' | 'field';

export type Hiding = {
  readonly name: string;
  readonly index: number;
  readonly kind: HidingKind;
  readonly scope: string;
  readonly inherited: Inherited;
};

type Scope = {
  readonly name: string;
  readonly own: OwnFrame | undefined;
  readonly declared: readonly DeclaredName[];
  readonly used: ReadonlySet<string>;
};

const NOT_USES = new Set(['.', '::', '@', 'case', 'break', 'continue']);
const LABEL_STARTS = new Set([';', '{', '}']);
const THIS = 'this';
const SUPER = 'super';
const QUALIFIERS = [THIS, SUPER];
const AFTER_MEMBER = 3;
const ASSIGNED_VALUE = 4;
const CAST_BEFORE = new Set(['return', 'throw', 'yield', 'case', 'assert', 'else']);
const CAST_OPERANDS = new Set(['(', '!', '~', 'new', THIS, SUPER]);
const OPERAND_KINDS = new Set(['identifier', 'number', 'string', 'char']);
const TYPE_LEADERS = new Set(['new', 'instanceof', 'throws', 'extends', 'implements', '@']);
const TYPE_FOLLOWERS = new Set(['<', '::', '[', '...']);
const UPPER_START = /^[A-Z]/u;

function inAnnotation(source: SourceFile, index: number): boolean {
  const open = source.opener[index] ?? -1;
  const steps = [open - 1];
  for (const at of steps) {
    if (source.tokens[at]?.kind === 'identifier' && textAt(source, at - 1) === '.') {
      steps.push(at - 2);
    }
  }
  return textAt(source, open) === '(' && textAt(source, (steps.at(-1) ?? open) - 1) === '@';
}

function isCastType(source: SourceFile, index: number): boolean {
  const before = source.tokens[index - 2];
  const operand = source.tokens[index + 2];
  const casting =
    before === undefined ||
    before.kind !== 'identifier' ||
    CAST_BEFORE.has(before.text) ||
    CAST_OPERANDS.has(before.text);
  return (
    textAt(source, index - 1) === '(' &&
    textAt(source, index + 1) === ')' &&
    casting &&
    (OPERAND_KINDS.has(operand?.kind ?? '') || CAST_OPERANDS.has(operand?.text ?? ''))
  );
}

function isPackagePrefix(source: SourceFile, index: number): boolean {
  const steps = [index];
  for (const at of steps) {
    if (textAt(source, at + 1) === '.' && source.tokens[at + 2]?.kind === 'identifier') {
      steps.push(at + 2);
    }
  }
  const end = steps.at(-1) ?? index;
  const typed = steps.slice(1).some((at) => UPPER_START.test(textAt(source, at)));
  const typeContext =
    source.tokens[end + 1]?.kind === 'identifier' ||
    TYPE_FOLLOWERS.has(textAt(source, end + 1)) ||
    TYPE_LEADERS.has(textAt(source, index - 1)) ||
    textAt(source, end) === 'class';
  return end > index && typed && typeContext;
}

function isTypePosition(source: SourceFile, index: number): boolean {
  const next = source.tokens[index + 1];
  const typeArgument = textAt(source, index - 1) === '<' && ['>', ','].includes(next?.text ?? '');
  return typeArgument || (next?.kind === 'identifier' && next.text !== 'instanceof');
}

function isShortUse(source: SourceFile, index: number): boolean {
  const next = textAt(source, index + 1);
  const before = textAt(source, index - 1);
  return (
    source.tokens[index]?.kind === 'identifier' &&
    !NOT_USES.has(before) &&
    next !== '(' &&
    !(next === ':' && LABEL_STARTS.has(before)) &&
    !(before === ',' && inCaseLabel(source, index)) &&
    !declaresAt(source, index) &&
    !inAnnotation(source, index) &&
    !isCastType(source, index) &&
    !isTypePosition(source, index) &&
    !isPackagePrefix(source, index)
  );
}

function memberAt(source: SourceFile, index: number, owner: string): string | undefined {
  const member = source.tokens[index + 2];
  const read =
    textAt(source, index) === owner &&
    textAt(source, index - 1) !== '.' &&
    textAt(source, index + 1) === '.' &&
    member?.kind === 'identifier' &&
    textAt(source, index + AFTER_MEMBER) !== '(';
  return read ? member.text : undefined;
}

function qualifiedUses(source: SourceFile, indexes: readonly number[], owner: string): Set<string> {
  return new Set(indexes.flatMap((index) => memberAt(source, index, owner) ?? []));
}

function scopeOf(
  source: SourceFile,
  { indexes, own, classOpen }: { indexes: readonly number[]; own?: OwnFrame; classOpen?: number },
): Scope {
  const local = indexes.filter((index) => (source.opener[index] ?? -1) !== classOpen);
  const declared = namesDeclaredIn(source, local);
  const firstDeclared = new Map(declared.toReversed().map(({ name, index }) => [name, index]));
  const used = indexes
    .filter((index) => isShortUse(source, index))
    .filter((index) => index < (firstDeclared.get(textAt(source, index)) ?? Infinity))
    .map((index) => textAt(source, index));
  return { name: own?.frame.name ?? '<init>', own, declared, used: new Set(used) };
}

function scopesOf(source: SourceFile, regions: OwnRegions, classOpen: number): Scope[] {
  const instance = regions.frames.filter(({ isStatic }) => !isStatic);
  const spans = regions.frames.map(({ frame }) => ({ from: frame.open - 1, to: frame.body.to }));
  const outside = ownIndexes(regions, regions.body).filter((index) => !inside(spans, index));
  return [
    ...instance.map((own) =>
      scopeOf(source, { indexes: ownIndexes(regions, frameSpan(own.frame)), own }),
    ),
    scopeOf(source, { indexes: outside, classOpen }),
  ];
}

const SETTER = /^(?:set|with)[A-Z]/u;

function statementEnd(source: SourceFile, from: number): number {
  for (const { index } of forward(source, from)) {
    if ([';', '}'].includes(textAt(source, index))) {
      return index;
    }
  }
  return source.tokens.length;
}

function readsName(source: SourceFile, { from, to }: { from: number; to: number }, name: string) {
  return between(from, to).some(
    (index) =>
      textAt(source, index) === name &&
      !['.', '::'].includes(textAt(source, index - 1)) &&
      textAt(source, index + 1) !== '(',
  );
}

function assignsField(source: SourceFile, frame: OwnFrame['frame'], name: string): boolean {
  return between(frame.body.from, frame.body.to).some((index) => {
    const value = index + ASSIGNED_VALUE;
    return (
      QUALIFIERS.some((owner) => memberAt(source, index, owner) === name) &&
      textAt(source, index + AFTER_MEMBER) === '=' &&
      readsName(source, { from: value, to: statementEnd(source, value) }, name)
    );
  });
}

function passedToSuper(source: SourceFile, frame: OwnFrame['frame'], name: string): boolean {
  return between(frame.body.from, frame.body.to).some((index) => {
    const open = index + AFTER_MEMBER;
    return (
      textAt(source, index) === SUPER &&
      textAt(source, index + 1) === '.' &&
      textAt(source, index + 2) === frame.name &&
      textAt(source, open) === '(' &&
      readsName(source, { from: open + 1, to: source.partner[open] ?? open }, name)
    );
  });
}

function parameterLeftOut(source: SourceFile, own: OwnFrame, name: string): boolean {
  const { frame } = own;
  return (
    own.constructor ||
    SETTER.test(frame.name) ||
    !readsName(source, frame.body, name) ||
    assignsField(source, frame, name) ||
    passedToSuper(source, frame, name)
  );
}

function hidingOf(
  source: SourceFile,
  { scope, inherited }: { scope: Scope; inherited: Inherited },
): Hiding | undefined {
  const { own } = scope;
  const { name } = inherited.field;
  const first = scope.declared.find((each) => each.name === name);
  if (own === undefined || first === undefined) {
    return undefined;
  }
  const parameter = first.index < own.frame.body.from;
  if (parameter && parameterLeftOut(source, own, name)) {
    return undefined;
  }
  return {
    name,
    index: first.index,
    kind: parameter ? 'parameter' : 'variable',
    scope: scope.name,
    inherited,
  };
}

export function hidingsIn(
  source: SourceFile,
  type: TypeDecl,
  inherited: ReadonlyMap<string, Inherited>,
): Hiding[] {
  const regions = ownRegions(source, type.body, type.name);
  const all = ownIndexes(regions, type.body);
  const viaThis = qualifiedUses(source, all, THIS);
  const viaSuper = qualifiedUses(source, all, SUPER);
  const fieldHidings = type.fields.flatMap((field): Hiding[] => {
    const parent = inherited.get(field.name);
    return parent === undefined || field.modifiers.has('static') || !viaSuper.has(field.name)
      ? []
      : [
          {
            name: field.name,
            index: field.index,
            kind: 'field',
            scope: type.name,
            inherited: parent,
          },
        ];
  });
  const own = new Set(type.fields.map(({ name }) => name));
  const scopes = scopesOf(source, regions, type.body.from - 1);
  const localHidings = [...inherited.values()]
    .filter(({ field: { name } }) => !own.has(name))
    .filter(
      ({ field: { name } }) =>
        viaThis.has(name) || viaSuper.has(name) || scopes.some(({ used }) => used.has(name)),
    )
    .flatMap((inheritedField) =>
      scopes.flatMap((scope) => hidingOf(source, { scope, inherited: inheritedField }) ?? []),
    );
  return [...fieldHidings, ...localHidings];
}
