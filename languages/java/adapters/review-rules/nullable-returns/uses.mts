import { declaredIn, typeBefore } from './declarations.mts';
import { copyingCall, resolveAt, siteAt } from './calls.mts';
import { splitTopLevel } from '../max-value-sums/source-file.mts';
import { newBefore } from './returns.mts';
import type { MethodInfo } from './declarations.mts';
import type { FileModel, Lookup, ProjectClass, Scope, Site, Target } from './calls.mts';
import type { Frame, SourceFile } from '../max-value-sums/sum-types.mts';

export type { FileModel, ProjectClass, Target } from './calls.mts';

export type Use = { readonly line: number; readonly form: string; readonly variable?: string };

export type SiteResult = {
  readonly target: Target;
  readonly outcome: 'use' | 'checked' | 'neutral';
  readonly use?: Use;
};

const BOXED = new Set([
  'Integer',
  'Long',
  'Short',
  'Byte',
  'Character',
  'Boolean',
  'Double',
  'Float',
]);
const PRIMITIVES = new Set(['int', 'long', 'short', 'byte', 'char', 'boolean', 'double', 'float']);
const GUARD_CALLEE = /null|empty|blank|valid|check|require|assert|verify|present/iu;
const PREDICATE_CALLEE = /^(?:is|has|can|exists|supports)[A-Z]/u;
const ARITHMETIC = new Set(['-', '*', '/', '%', '<', '>', '<=', '>=', '++', '--']);
const EQUALITY = new Set(['==', '!=']);

const POSITIONS = new WeakMap<Frame, Map<string, number[]>>();

function positionsIn(source: SourceFile, frame: Frame): Map<string, number[]> {
  const cached = POSITIONS.get(frame);
  if (cached !== undefined) {
    return cached;
  }
  const positions = new Map<string, number[]>();
  for (let index = frame.body.from; index < frame.body.to; index += 1) {
    const text = source.tokens[index]?.text ?? '';
    positions.set(text, [...(positions.get(text) ?? []), index]);
  }
  POSITIONS.set(frame, positions);
  return positions;
}

function sameCallChecked(source: SourceFile, frame: Frame, site: Site): boolean {
  const { tokens } = source;
  const texts = tokens.slice(site.start, site.close + 1).map(({ text }) => text);
  const candidates = positionsIn(source, frame).get(texts[0] ?? '') ?? [];
  return candidates
    .filter((index) => index < site.start)
    .some((index) => {
      const matches = texts.every((text, offset) => tokens[index + offset]?.text === text);
      const after = tokens[index + texts.length]?.text ?? '';
      return matches && EQUALITY.has(after) && tokens[index + texts.length + 1]?.text === 'null';
    });
}

function isGuard(source: SourceFile, at: number): boolean {
  const { tokens, opener } = source;
  const before = tokens[at - 1]?.text ?? '';
  const after = tokens[at + 1]?.text ?? '';
  const comparison =
    (EQUALITY.has(after) && tokens[at + 2]?.text === 'null') ||
    (EQUALITY.has(before) && tokens[at - 2]?.text === 'null');
  const open = opener[at] ?? -1;
  const argument = (before === '(' || before === ',') && (after === ')' || after === ',');
  const callee = tokens[open - 1]?.text ?? '';
  return (
    comparison ||
    after === 'instanceof' ||
    before === 'assert' ||
    (argument && (GUARD_CALLEE.test(callee) || PREDICATE_CALLEE.test(callee)))
  );
}

function isArithmetic(source: SourceFile, at: number): boolean {
  const { tokens } = source;
  const before = tokens[at - 1]?.text ?? '';
  const after = tokens[at + 1]?.text ?? '';
  const number = (index: number): boolean => tokens[index]?.kind === 'number';
  return (
    ARITHMETIC.has(before) ||
    ARITHMETIC.has(after) ||
    (EQUALITY.has(after) && number(at + 2)) ||
    ((before === '+' || after === '+') && (number(at - 2) || number(at + 2)))
  );
}

function statementForm(source: SourceFile, at: number): string | undefined {
  const { tokens, opener } = source;
  const before = tokens[at - 1]?.text ?? '';
  const open = opener[at] ?? -1;
  const keyword = tokens[open - 1]?.text;
  const wrapped = tokens[open]?.text === '(' && tokens[at + 1]?.text === ')';
  if (before === ':' && wrapped && keyword === 'for') {
    return 'iterated';
  }
  const guarded = wrapped && before === '(';
  if (guarded && keyword === 'switch') {
    return 'switched on';
  }
  return guarded && keyword === 'synchronized' ? 'locked on' : undefined;
}

function useForm(source: SourceFile, at: number, type: string): string | undefined {
  const after = source.tokens[at + 1]?.text ?? '';
  if ((after === '.' && source.tokens[at + 2]?.kind === 'identifier') || after === '[') {
    return 'dereferenced';
  }
  const copying = copyingCall(source, at);
  const copied =
    copying === undefined ? undefined : `passed to \`${copying}(...)\`, which dereferences it,`;
  const unboxed = BOXED.has(type) && isArithmetic(source, at) ? 'unboxed' : undefined;
  return statementForm(source, at) ?? copied ?? unboxed;
}

type Later = {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly type: string;
};

function parameterAt(
  scope: Scope,
  at: number,
): { cls: ProjectClass; method: MethodInfo; name: string } | undefined {
  const { tokens, opener } = scope.model.source;
  const open = opener[at] ?? -1;
  const direct =
    ['(', ','].includes(tokens[at - 1]?.text ?? '') &&
    [')', ','].includes(tokens[at + 1]?.text ?? '') &&
    tokens[open]?.text === '(';
  const resolved = direct ? resolveAt(scope, open - 1) : undefined;
  if (resolved === undefined) {
    return undefined;
  }
  const spans = splitTopLevel(scope.model.source, { from: open + 1, to: resolved.close });
  const position = spans.findIndex((span) => at >= span.from && at < span.to);
  const methods = resolved.cls.methods.filter(
    (method) =>
      method.name === tokens[open - 1]?.text && method.arity === resolved.count && !method.varargs,
  );
  const method = methods.length === 1 ? methods[0] : undefined;
  const param = method?.frame.params[position];
  return method === undefined || param === undefined
    ? undefined
    : { cls: resolved.cls, method, name: param.name };
}

function passedForm(scope: Scope, at: number): string | undefined {
  const target = parameterAt(scope, at);
  if (target === undefined) {
    return undefined;
  }
  const inside = { ...scope, model: { ...scope.model, source: target.cls.source } };
  const { from, to } = target.method.frame.body;
  const found = laterUse(inside, { name: target.name, from, to, type: '' }, true);
  return typeof found === 'object'
    ? `passed to \`${target.cls.name}.${target.method.name}\`, which dereferences it,`
    : undefined;
}

function laterUse(
  scope: Scope,
  { name, from, to, type }: Later,
  nested = false,
): SiteResult['outcome'] | Use {
  const { source } = scope.model;
  const { tokens } = source;
  for (let at = from; at < to; at += 1) {
    const token = tokens[at];
    if (token?.text !== name || tokens[at - 1]?.text === '.') {
      continue;
    }
    const redeclared = typeBefore(tokens, at) !== undefined && tokens[at + 1]?.text === '=';
    if (isGuard(source, at)) {
      return 'checked';
    }
    if (tokens[at + 1]?.text === '=' || redeclared) {
      return 'neutral';
    }
    const form = useForm(source, at, type) ?? (nested ? undefined : passedForm(scope, at));
    if (form !== undefined) {
      return { line: token.line, form, variable: name };
    }
  }
  return 'neutral';
}

type Assigned = { name: string; type: string; open: number; cast: string | undefined };

function castBefore(
  source: SourceFile,
  start: number,
): { equals: number; cast?: string | undefined } {
  const { tokens, partner } = source;
  if (tokens[start - 1]?.text !== ')') {
    return { equals: start - 1 };
  }
  const open = partner[start - 1] ?? -1;
  const inside = tokens.slice(open + 1, start - 1);
  const isType =
    inside.length > 0 &&
    inside.every((token) => token.kind === 'identifier' || '.<>[]?'.includes(token.text));
  return isType ? { equals: open - 1, cast: inside.at(-1)?.text } : { equals: -1 };
}

function assignedLocal(scope: Scope, site: Site): Assigned | undefined {
  const { tokens, opener } = scope.model.source;
  const { equals, cast } = castBefore(scope.model.source, site.start);
  const target = tokens[equals - 1];
  const open = opener[equals - 1] ?? -1;
  const whole = tokens[equals]?.text === '=' && tokens[site.close + 1]?.text === ';';
  if (!whole || target?.kind !== 'identifier' || tokens[open]?.text !== '{') {
    return undefined;
  }
  const local = scope.declared.findLast(
    (each) => each.name === target.text && each.index <= equals - 1,
  );
  const inferred = tokens[equals - 2]?.text === 'var' ? 'var' : undefined;
  const type = local?.type ?? inferred;
  return type === undefined ? undefined : { name: target.text, type, open, cast };
}

function inPlaceCheck(source: SourceFile, site: Site): boolean {
  const { tokens } = source;
  const after = tokens[site.close + 1]?.text ?? '';
  const before = tokens[site.start - 1]?.text ?? '';
  const open = source.opener[site.start] ?? -1;
  const argument =
    before === '(' && after === ')' && GUARD_CALLEE.test(tokens[open - 1]?.text ?? '');
  return (
    (EQUALITY.has(after) && tokens[site.close + 2]?.text === 'null') ||
    (EQUALITY.has(before) && tokens[site.start - 2]?.text === 'null') ||
    argument
  );
}

function localResult(scope: Scope, site: Site, local: Assigned): SiteResult {
  const { tokens, partner } = scope.model.source;
  const { target } = site;
  const boxed = BOXED.has(target.method.returnType) || BOXED.has(local.cast ?? '');
  const to = partner[local.open] ?? tokens.length;
  const later =
    PRIMITIVES.has(local.type) && boxed
      ? { line: tokens[site.name]?.line ?? 0, form: 'unboxed', variable: local.name }
      : laterUse(scope, { name: local.name, from: site.close + 2, to, type: local.type });
  return typeof later === 'string'
    ? { target, outcome: later }
    : { target, outcome: 'use', use: later };
}

function resultOf(scope: Scope, site: Site): SiteResult {
  const { source } = scope.model;
  const { tokens } = source;
  const { target } = site;
  const local = assignedLocal(scope, site);
  if (inPlaceCheck(source, site) || sameCallChecked(source, scope.frame, site)) {
    return { target, outcome: 'checked' };
  }
  if (local !== undefined) {
    return localResult(scope, site, local);
  }
  const direct =
    tokens[site.close + 1]?.text === '.' && tokens[site.close + 2]?.kind === 'identifier';
  const line = tokens[site.name]?.line ?? 0;
  return direct
    ? { target, outcome: 'use', use: { line, form: 'dereferenced' } }
    : { target, outcome: 'neutral' };
}

function isDeclared(model: FileModel, frame: Frame): boolean {
  const { tokens, opener, partner } = model.source;
  const open = opener[frame.open - 1] ?? -1;
  const anonymous = tokens[open - 1]?.text === ')' && newBefore(tokens, partner[open - 1] ?? 0);
  return model.classes.some((cls) => cls.open === open) || anonymous;
}

export function sitesIn(model: FileModel, lookup: Lookup): SiteResult[] {
  const frames = model.source.frames.filter((frame) => isDeclared(model, frame));
  const owners = new Map<number, Scope>();
  for (const frame of frames) {
    const scope = { model, frame, lookup, declared: declaredIn(model.source, frame) };
    for (let index = frame.body.from; index < frame.body.to; index += 1) {
      owners.set(index, scope);
    }
  }
  return [...owners].flatMap(([index, scope]) => {
    const site = siteAt(scope, index);
    return site === undefined ? [] : [resultOf(scope, site)];
  });
}
