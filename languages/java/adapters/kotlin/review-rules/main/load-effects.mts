import type { KotlinFile } from '../typed/kotlin-fact-types.mts';
import type { BindingFact, ChainSegment, LoadFact } from '../typed/kotlin-flow-types.mts';
import type { ReviewFinding, RuleOptions } from '../typed/review-finding-types.mts';
import type {
  ChainState,
  EffectScope,
  InstanceState,
  Root,
  UnknownState,
} from './typed/load-effect-state.mts';
import { LOAD_EFFECT_RULE } from '../../../../messages/load-effects.mts';
import { simpleTypeName } from '../kotlin-facts.mts';
import {
  constructorKind,
  createdType,
  factoryResult,
  hasEffect,
  isImportBanned,
  isKnownType,
  isTopLevelEffect,
} from './load-effect-types.mts';
import { declaredClasses, entryOwners, messageOf } from './load-effect-report.mts';

const DEFAULT_PACKAGES = ['java.lang', 'kotlin', 'kotlin.io'];
const EXPANSIONS = 3;
const UNKNOWN: UnknownState = { kind: 'unknown' };
const OPAQUE: ChainSegment = { opaque: true };
const AMBIGUOUS: BindingFact = { name: '', owner: '', local: false };
const CAPITALIZED = /^[A-Z]/u;
const BUILDER = '.Builder';
const FILE_ARGUMENT = /^(?:java\.io\.)?File\(|^(?:java\.nio\.file\.)?Paths?\.(?:of|get)\(/u;
const FILE_NAME_ARGUMENT = /^"|^(?:java\.io\.)?File\(/u;

function instance(type: string): InstanceState {
  return { kind: 'instance', type, via: type };
}

function importedPath(name: string, file: KotlinFile): string | undefined {
  return file.imports.find(
    ({ path: target, alias, all }) => !all && (alias ?? target.split('.').at(-1)) === name,
  )?.path;
}

function resolveName(
  name: string,
  scope: { file: KotlinFile; declared: Set<string> },
): string | undefined {
  const { file, declared } = scope;
  const imported = importedPath(name, file);
  if (imported !== undefined) {
    return imported;
  }
  if (declared.has([file.package, name].filter(Boolean).join('.'))) {
    return undefined;
  }
  return [
    ...file.imports.filter(({ all }) => all).map(({ path: target }) => `${target}.${name}`),
    ...DEFAULT_PACKAGES.map((target) => `${target}.${name}`),
  ].find((candidate) => isKnownType(candidate) || isTopLevelEffect(candidate));
}

function createdBy(type: string | undefined): ChainState {
  return type === undefined ? UNKNOWN : instance(createdType(type));
}

function declaredType(text: string, scope: EffectScope): string | undefined {
  const bare = simpleTypeName(text) ?? '';
  const written = text.replaceAll(/[?\s]|<.*$/gu, '');
  return isKnownType(written) ? written : resolveName(bare, scope);
}

function bindingOf(name: string, scope: EffectScope): BindingFact | undefined {
  const named = (scope.file.bindings ?? []).filter((binding) => binding.name === name);
  const own = named.filter(({ owner }) => owner === scope.owner);
  const chosen = own.length > 0 ? own : named;
  const forms = new Set(
    chosen.map(({ type, init }) => JSON.stringify(type === undefined ? { init } : { type })),
  );
  return forms.size > 1 ? AMBIGUOUS : chosen[0];
}

function isVariable(segment: ChainSegment | undefined): boolean {
  return (
    segment !== undefined &&
    segment.opaque !== true &&
    !segment.call &&
    !CAPITALIZED.test(segment.name ?? '')
  );
}

function expandOnce(segments: ChainSegment[], scope: EffectScope): ChainSegment[] {
  const [first, ...rest] = segments;
  const binding =
    first?.name !== undefined && isVariable(first) ? bindingOf(first.name, scope) : undefined;
  if (binding === undefined || binding.type !== undefined) {
    return segments;
  }
  const init = binding.init ?? [];
  return init.length === 0 ? [OPAQUE, ...rest] : [...init, ...rest];
}

function typedState(binding: BindingFact, scope: EffectScope): ChainState {
  const type = binding.type === undefined ? undefined : declaredType(binding.type, scope);
  return type === undefined ? UNKNOWN : instance(type);
}

function qualifiedRoot(segments: ChainSegment[]): Root {
  const names = segments.map((_, index) =>
    segments
      .slice(0, index + 1)
      .map(({ name }) => name ?? '')
      .join('.'),
  );
  const index = names.findIndex((name, at) => at > 0 && isKnownType(name));
  if (index < 0) {
    return { state: UNKNOWN, used: segments.length };
  }
  const name = names[index] ?? '';
  const state: ChainState =
    segments[index]?.call === true ? createdBy(name) : { kind: 'static', type: name };
  return { state, used: index + 1 };
}

function rootState(segments: ChainSegment[], scope: EffectScope): Root {
  const [first] = segments;
  if (first === undefined || first.opaque === true) {
    return { state: UNKNOWN, used: 1 };
  }
  if (first.call) {
    return { state: createdBy(resolveName(first.name ?? '', scope)), used: 1 };
  }
  const firstName = first.name ?? '';
  if (CAPITALIZED.test(firstName)) {
    const type = resolveName(firstName, scope);
    const known = type !== undefined && !isImportBanned(type);
    return { state: known ? { kind: 'static', type } : UNKNOWN, used: 1 };
  }
  const binding = bindingOf(firstName, scope);
  return binding === undefined
    ? qualifiedRoot(segments)
    : { state: typedState(binding, scope), used: 1 };
}

function getterOf(name: string): string {
  return `get${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function staticStep(type: string, segment: ChainSegment): ChainState {
  const segmentName = segment.name ?? '';
  if (CAPITALIZED.test(segmentName)) {
    const nested = `${type}.${segmentName}`;
    return segment.call ? instance(nested) : { kind: 'static', type: nested };
  }
  const made = segment.call ? factoryResult(type, segmentName) : undefined;
  return made === undefined ? UNKNOWN : instance(made);
}

function instanceStep({ type, via }: InstanceState, segment: ChainSegment): InstanceState {
  if (type?.endsWith(BUILDER)) {
    const built = segment.name === 'build' ? type.slice(0, -BUILDER.length) : type;
    return { kind: 'instance', type: built, via: via === type ? built : via };
  }
  const made =
    type === undefined
      ? undefined
      : factoryResult(type, segment.call ? (segment.name ?? '') : getterOf(segment.name ?? ''));
  return { kind: 'instance', type: made, via: via ?? made };
}

function step(state: ChainState, segment: ChainSegment): ChainState {
  if (state.kind === 'unknown' || segment.opaque === true) {
    return UNKNOWN;
  }
  return state.kind === 'static' ? staticStep(state.type, segment) : instanceStep(state, segment);
}

function chainState(segments: ChainSegment[], scope: EffectScope): ChainState {
  const expanded = Array.from({ length: EXPANSIONS }).reduce<ChainSegment[]>(
    (current) => expandOnce(current, scope),
    segments,
  );
  if (expanded.length === 0) {
    return UNKNOWN;
  }
  const { state, used } = rootState(expanded, scope);
  return expanded.slice(used).reduce(step, state);
}

function memberEffect(state: ChainState, item: LoadFact): boolean {
  const argumentCount = item.arguments?.length ?? 0;
  if (state.kind === 'static') {
    return (
      item.call === true && hasEffect('static', state.type, { name: item.name, argumentCount })
    );
  }
  if (state.kind !== 'instance') {
    return false;
  }
  const names = item.call ? [item.name] : [item.name, getterOf(item.name)];
  const lookups: [string, string | undefined][] = [
    ['instance', state.type],
    ['chain', state.via],
    ['chain', state.type],
  ];
  return names.some((name) =>
    lookups.some(([table, type]) => hasEffect(table, type, { name, argumentCount })),
  );
}

function constructorEffect(kind: string, item: LoadFact): boolean {
  const first = item.arguments?.[0]?.text ?? '';
  const matches: Record<string, boolean> = {
    any: true,
    arguments: (item.arguments?.length ?? 0) > 0,
    'file-name': FILE_NAME_ARGUMENT.test(first),
    file: FILE_ARGUMENT.test(first),
  };
  return matches[kind] === true;
}

function namedEffect(resolved: string | undefined, item: LoadFact): boolean {
  if (resolved === undefined) {
    return false;
  }
  const kind = constructorKind(resolved);
  if (kind !== undefined) {
    return constructorEffect(kind, item);
  }
  const owner = resolved.split('.').slice(0, -1).join('.');
  const call = {
    name: resolved.slice(resolved.lastIndexOf('.') + 1),
    argumentCount: item.arguments?.length ?? 0,
  };
  return isTopLevelEffect(resolved) || hasEffect('static', owner, call);
}

function isPackagePath(segments: ChainSegment[]): boolean {
  return segments.every((segment) => !(segment.call || CAPITALIZED.test(segment.name ?? 'X')));
}

function isLoadEffect(item: LoadFact, scope: EffectScope): boolean {
  if (item.receiver.length === 0) {
    return item.call === true && namedEffect(resolveName(item.name, scope), item);
  }
  if (item.call === true && isPackagePath(item.receiver)) {
    const qualified = [...item.receiver.map(({ name }) => name ?? ''), item.name].join('.');
    if (CAPITALIZED.test(item.name) || isTopLevelEffect(qualified)) {
      return namedEffect(qualified, item);
    }
  }
  return memberEffect(chainState(item.receiver, scope), item);
}

function fileFindings(
  file: KotlinFile,
  { finding, declared }: { finding: RuleOptions['finding']; declared: Set<string> },
): ReviewFinding[] {
  const entries = entryOwners(file);
  return (file.loads ?? [])
    .filter(({ context }) => !entries.has(context.owner))
    .filter((item) => isLoadEffect(item, { file, declared, owner: item.context.owner }))
    .map((item) => {
      const { owner, member } = item.context;
      const symbol = owner === '' ? member : `${owner}.${member}`;
      return finding({
        rule: LOAD_EFFECT_RULE,
        file: file.file,
        line: item.line,
        symbol,
        key: `${symbol}:${item.name}`,
        message: messageOf(item, file),
      });
    });
}

export function loadEffectFindings(
  files: KotlinFile[],
  { finding, declaredIn = files }: RuleOptions,
): ReviewFinding[] {
  const declared = declaredClasses(declaredIn);
  return files
    .filter(({ test }) => !test)
    .flatMap((file) => fileFindings(file, { finding, declared }));
}
