import path from 'node:path';
import { LOAD_EFFECT_RULE, shortCall } from '../../../../messages/load-effects.mjs';
import { simpleTypeName } from '../kotlin-facts.mjs';
import {
  constructorKind,
  createdType,
  factoryResult,
  hasEffect,
  isKnownType,
  isTopLevelEffect,
} from './load-effect-types.mjs';

const DEFAULT_PACKAGES = ['java.lang', 'kotlin', 'kotlin.io'];
const EXPANSIONS = 3;
const UNKNOWN = { kind: 'unknown' };
const OPAQUE = { opaque: true };
const AMBIGUOUS = { ambiguous: true };
const CAPITALIZED = /^[A-Z]/u;
const BUILDER = '.Builder';
const FILE_ARGUMENT = /^(?:java\.io\.)?File\(|^(?:java\.nio\.file\.)?Paths?\.(?:of|get)\(/u;
const FILE_NAME_ARGUMENT = /^"|^(?:java\.io\.)?File\(/u;

function instance(type) {
  return { kind: 'instance', type, via: type };
}

function importedPath(name, file) {
  return file.imports.find(
    ({ path: target, alias, all }) => !all && (alias ?? target.split('.').at(-1)) === name,
  )?.path;
}

function resolveName(name, scope) {
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

function createdBy(type) {
  return type === undefined ? UNKNOWN : instance(createdType(type));
}

function declaredType(text, scope) {
  const bare = simpleTypeName(text);
  const written = text.replaceAll(/[?\s]|<.*$/gu, '');
  return isKnownType(written) ? written : resolveName(bare, scope);
}

function bindingOf(name, scope) {
  const named = scope.file.bindings.filter((binding) => binding.name === name);
  const own = named.filter(({ owner }) => owner === scope.owner);
  const chosen = own.length > 0 ? own : named;
  const forms = new Set(
    chosen.map(({ type, init }) => JSON.stringify(type === undefined ? { init } : { type })),
  );
  return forms.size > 1 ? AMBIGUOUS : chosen[0];
}

function isVariable(segment) {
  return (
    segment !== undefined &&
    segment.opaque !== true &&
    !segment.call &&
    !CAPITALIZED.test(segment.name)
  );
}

function expandOnce(segments, scope) {
  const [first, ...rest] = segments;
  const binding = isVariable(first) ? bindingOf(first.name, scope) : undefined;
  if (binding === undefined || binding.type !== undefined) {
    return segments;
  }
  return (binding.init ?? []).length === 0 ? [OPAQUE, ...rest] : [...binding.init, ...rest];
}

function typedState(binding, scope) {
  const type = binding.type === undefined ? undefined : declaredType(binding.type, scope);
  return type === undefined ? UNKNOWN : instance(type);
}

function qualifiedRoot(segments) {
  const names = segments.map((_, index) =>
    segments
      .slice(0, index + 1)
      .map(({ name }) => name)
      .join('.'),
  );
  const index = names.findIndex((name, at) => at > 0 && isKnownType(name));
  if (index < 0) {
    return { state: UNKNOWN, used: segments.length };
  }
  const state = segments[index].call
    ? createdBy(names[index])
    : { kind: 'static', type: names[index] };
  return { state, used: index + 1 };
}

function rootState(segments, scope) {
  const [first] = segments;
  if (first.opaque === true) {
    return { state: UNKNOWN, used: 1 };
  }
  if (first.call) {
    return { state: createdBy(resolveName(first.name, scope)), used: 1 };
  }
  if (CAPITALIZED.test(first.name)) {
    const type = resolveName(first.name, scope);
    return { state: type === undefined ? UNKNOWN : { kind: 'static', type }, used: 1 };
  }
  const binding = bindingOf(first.name, scope);
  return binding === undefined
    ? qualifiedRoot(segments)
    : { state: typedState(binding, scope), used: 1 };
}

function getterOf(name) {
  return `get${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function staticStep(type, segment) {
  if (CAPITALIZED.test(segment.name)) {
    const nested = `${type}.${segment.name}`;
    return segment.call ? instance(nested) : { kind: 'static', type: nested };
  }
  const made = segment.call ? factoryResult(type, segment.name) : undefined;
  return made === undefined ? UNKNOWN : instance(made);
}

function instanceStep({ type, via }, segment) {
  if (type?.endsWith(BUILDER)) {
    const built = segment.name === 'build' ? type.slice(0, -BUILDER.length) : type;
    return { kind: 'instance', type: built, via: via === type ? built : via };
  }
  const made =
    type === undefined
      ? undefined
      : factoryResult(type, segment.call ? segment.name : getterOf(segment.name));
  return { kind: 'instance', type: made, via: via ?? made };
}

function step(state, segment) {
  if (state.kind === 'unknown' || segment.opaque === true) {
    return UNKNOWN;
  }
  return state.kind === 'static' ? staticStep(state.type, segment) : instanceStep(state, segment);
}

function chainState(segments, scope) {
  const expanded = Array.from({ length: EXPANSIONS }).reduce(
    (current) => expandOnce(current, scope),
    segments,
  );
  if (expanded.length === 0) {
    return UNKNOWN;
  }
  const { state, used } = rootState(expanded, scope);
  return expanded.slice(used).reduce(step, state);
}

function memberEffect(state, item) {
  const argumentCount = item.arguments?.length ?? 0;
  if (state.kind === 'static') {
    return item.call && hasEffect('static', state.type, { name: item.name, argumentCount });
  }
  const names = item.call ? [item.name] : [item.name, getterOf(item.name)];
  const lookups = [
    ['instance', state.type],
    ['chain', state.via],
    ['chain', state.type],
  ];
  return (
    state.kind === 'instance' &&
    names.some((name) =>
      lookups.some(([table, type]) => hasEffect(table, type, { name, argumentCount })),
    )
  );
}

function constructorEffect(kind, item) {
  const first = item.arguments[0]?.text ?? '';
  const matches = {
    any: true,
    arguments: item.arguments.length > 0,
    'file-name': FILE_NAME_ARGUMENT.test(first),
    file: FILE_ARGUMENT.test(first),
  };
  return matches[kind] === true;
}

function namedEffect(resolved, item) {
  if (resolved === undefined) {
    return false;
  }
  const kind = constructorKind(resolved);
  if (kind !== undefined) {
    return constructorEffect(kind, item);
  }
  const owner = resolved.split('.').slice(0, -1).join('.');
  const call = { name: resolved.split('.').at(-1), argumentCount: item.arguments.length };
  return isTopLevelEffect(resolved) || hasEffect('static', owner, call);
}

function isPackagePath(segments) {
  return segments.every((segment) => !segment.call && !CAPITALIZED.test(segment.name ?? 'X'));
}

function isLoadEffect(item, scope) {
  if (item.receiver.length === 0) {
    return item.call && namedEffect(resolveName(item.name, scope), item);
  }
  if (item.call && CAPITALIZED.test(item.name) && isPackagePath(item.receiver)) {
    const qualified = [...item.receiver.map(({ name }) => name), item.name].join('.');
    return namedEffect(qualified, item);
  }
  return memberEffect(chainState(item.receiver, scope), item);
}

function entryOwners(file) {
  return new Set(
    file.functions
      .filter(
        ({ name, owner, annotations }) =>
          name === 'main' && (owner === '' || annotations.includes('JvmStatic')),
      )
      .map(({ owner }) => owner),
  );
}

function placeOf({ kind, owner, member }, file) {
  const outer = owner.replace(/\.[^.]+$/u, '');
  const places = {
    file: `${path.basename(file.file)} loads (top-level ${member})`,
    object: `object ${owner} loads (${member})`,
    companion: `the companion object of ${outer} loads (${member})`,
    enum: `enum class ${owner} loads (${member})`,
    singleton: `the companion object of ${owner} loads and creates a ${owner} (${member})`,
  };
  return places[kind];
}

function messageOf(item, file) {
  return `Do this work in a function that main or the framework calls after startup (a @Bean method, an ApplicationRunner, a Ktor module) and pass the result in, or defer it with by lazy: \`${shortCall(item.text)}\` runs while ${placeOf(item.context, file)}, so it connects, starts threads or touches files in whatever order classes load, and in every test that touches it. Constants, loggers, Regex and collections can stay, and a file with fun main is not checked.`;
}

function declaredClasses(files) {
  return new Set(
    files.flatMap((file) =>
      file.classes.map((declared) => [file.package, declared.qualified].filter(Boolean).join('.')),
    ),
  );
}

function fileFindings(file, { finding, declared }) {
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

export function loadEffectFindings(files, { finding, declaredIn = files }) {
  const declared = declaredClasses(declaredIn);
  return files
    .filter(({ test }) => !test)
    .flatMap((file) => fileFindings(file, { finding, declared }));
}
