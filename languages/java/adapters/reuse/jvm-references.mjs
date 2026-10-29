import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { namesOf } from './source/jvm-tokens.mjs';

const TYPE_KINDS = new Set(['class', 'interface', 'enum', 'type']);
const MEMBER_SEPARATORS = new Set(['.', '::']);
const CALL_SEPARATORS = new Set(['.', '?.', '::']);

function qualified(packageName, name) {
  return packageName === '' ? name : `${packageName}.${name}`;
}

function lastSegment(dotted) {
  return dotted.slice(dotted.lastIndexOf('.') + 1);
}

function parentOf(dotted) {
  return dotted.includes('.') ? dotted.slice(0, dotted.lastIndexOf('.')) : '';
}

function named(name, local) {
  return local === undefined || local === name ? { name } : { name, alias: local };
}

function preferred(candidates, module) {
  return candidates.find((candidate) => candidate.module === module) ?? candidates[0];
}

function typeFile(index, fqn, module) {
  return preferred(index.types.get(fqn) ?? [], module)?.file;
}

function addDefinition(index, { file, parsed, module }, { name, kind, owner }) {
  if (owner !== undefined) {
    index.members.add(`${file}\0${owner}.${name}`);
    return;
  }
  const type = TYPE_KINDS.has(kind);
  if (type) {
    const fqn = qualified(parsed.packageName, name);
    index.types.set(fqn, [...(index.types.get(fqn) ?? []), { file, module }]);
  }
  const declared = index.packages.get(parsed.packageName);
  const targets = declared.get(name) ?? [];
  if (!targets.some((target) => target.file === file)) {
    declared.set(name, [...targets, { file, name, type, module }]);
  }
}

export function projectIndex(files) {
  const index = { types: new Map(), packages: new Map(), members: new Set() };
  for (const entry of files) {
    const { packageName } = entry.parsed;
    index.packages.set(packageName, index.packages.get(packageName) ?? new Map());
    for (const definition of entry.parsed.definitions) {
      addDefinition(index, entry, definition);
    }
  }
  return index;
}

function visibleTargets(targets, module) {
  const reachable = targets.some((target) => target.module === module)
    ? module
    : targets[0]?.module;
  const visible = targets.filter((target) => target.module === reachable);
  const types = visible.filter(({ type }) => type);
  return types.length > 0 ? [types[0]] : visible;
}

function packageBindings(index, { packageName, file, own, module }) {
  return [...(index.packages.get(packageName) ?? new Map())]
    .filter(([name]) => !own.has(name))
    .map(([name, targets]) => [
      name,
      visibleTargets(
        targets.filter((target) => target.file !== file),
        module,
      ),
    ])
    .filter(([, targets]) => targets.length > 0);
}

function memberImport(index, { parent, name, local, module }) {
  if (!index.types.has(parent)) {
    return [];
  }
  const owner = lastSegment(parent);
  return [{ file: typeFile(index, parent, module), name: `${owner}.${name}`, alias: local }];
}

function explicitTargets(index, entry, module) {
  const name = lastSegment(entry.path);
  const local = entry.alias ?? name;
  const parent = parentOf(entry.path);
  if (index.types.has(entry.path)) {
    return [{ file: typeFile(index, entry.path, module), ...named(name, local), type: true }];
  }
  const topLevel = (index.packages.get(parent)?.get(name) ?? []).filter(({ type }) => !type);
  if (topLevel.length === 0) {
    return memberImport(index, { parent, name, local, module });
  }
  return visibleTargets(topLevel, module).map(({ file }) => ({ file, ...named(name, local) }));
}

function implicitBindings(index, { file, parsed, module }) {
  const own = new Set(
    parsed.definitions.filter(({ owner }) => owner === undefined).map(({ name }) => name),
  );
  const wildcards = parsed.imports
    .filter((entry) => entry.wildcard && !entry.static)
    .map((entry) => entry.path);
  return [...wildcards.toReversed(), parsed.packageName].flatMap((packageName) =>
    packageBindings(index, { packageName, file, own, module }),
  );
}

function explicitBindings(index, { parsed, module }) {
  const explicit = new Map();
  for (const entry of parsed.imports.filter(({ wildcard }) => !wildcard)) {
    const local = entry.alias ?? lastSegment(entry.path);
    const targets = explicitTargets(index, entry, module);
    explicit.set(local, [...(explicit.get(local) ?? []), ...targets]);
  }
  return [...explicit].filter(([, targets]) => targets.length > 0);
}

export function fileBindings(index, entry) {
  const bindings = new Map([...implicitBindings(index, entry), ...explicitBindings(index, entry)]);
  for (const name of entry.parsed.declaredTypes) {
    bindings.delete(name);
  }
  return bindings;
}

function chainAt(tokens, index) {
  const positions = [index];
  for (const position of positions) {
    const next = tokens[position + 2];
    if (MEMBER_SEPARATORS.has(tokens[position + 1]?.text) && next?.kind === 'identifier') {
      positions.push(position + 2);
    }
  }
  return positions.map((position) => tokens[position].text);
}

function typeUses(index, { fqn, name, member, module }) {
  const file = typeFile(index, fqn, module);
  const usesMember = member !== undefined && index.members.has(`${file}\0${name}.${member}`);
  return [
    { file, name, alias: fqn },
    ...(usesMember ? [{ file, name: `${name}.${member}`, alias: `${fqn}.${member}` }] : []),
  ];
}

function prefixUses(index, { chain, length, module }) {
  const fqn = chain.slice(0, length).join('.');
  const name = chain[length - 1];
  if (index.types.has(fqn)) {
    return typeUses(index, { fqn, name, member: chain[length], module });
  }
  const packageName = chain.slice(0, length - 1).join('.');
  const topLevel = (index.packages.get(packageName)?.get(name) ?? []).filter(({ type }) => !type);
  return visibleTargets(topLevel, module).map(({ file }) => ({ file, name, alias: fqn }));
}

function qualifiedUses(index, chain, module) {
  const lengths = chain.map((_, offset) => chain.length - offset).filter((length) => length >= 2);
  for (const length of lengths) {
    const uses = prefixUses(index, { chain, length, module });
    if (uses.length > 0) {
      return uses;
    }
  }
  return [];
}

function boundUses(index, { local, targets, member }) {
  return targets.flatMap((target) => {
    const own = { file: target.file, ...named(target.name, target.alias) };
    const memberName = `${target.name}.${member}`;
    const usesMember =
      target.type && member !== undefined && index.members.has(`${target.file}\0${memberName}`);
    return usesMember
      ? [own, { file: target.file, ...named(memberName, `${local}.${member}`) }]
      : [own];
  });
}

function identifierUses(context, index) {
  const { tokens, bindings, projectIndex: project, module } = context;
  const local = tokens[index].text;
  const targets = bindings.get(local) ?? [];
  if (CALL_SEPARATORS.has(tokens[index - 1]?.text)) {
    return boundUses(project, { local, targets: targets.filter(({ type }) => !type) });
  }
  const chain = chainAt(tokens, index);
  return targets.length === 0
    ? qualifiedUses(project, chain, module)
    : boundUses(project, { local, targets, member: chain[1] });
}

function usesAt(context, index) {
  const token = context.tokens[index];
  if (token.kind === 'identifier') {
    return identifierUses(context, index);
  }
  return namesOf(token).flatMap((local) =>
    boundUses(context.projectIndex, { local, targets: context.bindings.get(local) ?? [] }),
  );
}

function starImports(index, { parsed, module }) {
  return parsed.imports
    .filter((entry) => entry.wildcard && index.types.has(entry.path))
    .map((entry) => ({ file: typeFile(index, entry.path, module), name: '*' }));
}

function groupedByTarget(file, uses) {
  const byTarget = new Map();
  for (const { file: to, name, alias } of uses.filter((use) => use.file !== file)) {
    const names = byTarget.get(to) ?? new Map();
    names.set(`${name}\0${alias ?? ''}`, named(name, alias));
    byTarget.set(to, names);
  }
  return [...byTarget].map(([to, names]) => ({ from: file, to, names: [...names.values()] }));
}

export function importFacts(index, { file, parsed, bindings, module }) {
  const context = { tokens: parsed.tokens, bindings, projectIndex: index, module };
  const uses = parsed.tokens
    .keys()
    .filter((position) => position >= parsed.headerEnd)
    .flatMap((position) => usesAt(context, position));
  return groupedByTarget(file, [...starImports(index, { parsed, module }), ...uses]);
}

function localReference(local, { file, others, declaredTypes }) {
  const other = others.get(local);
  if (other?.kind === 'const' && other.literal === true) {
    return `${local}=literal:${other.text}`;
  }
  return other !== undefined || declaredTypes.has(local) ? `${local}=${file}` : undefined;
}

function referenceOf(local, scope) {
  const targets = scope.bindings.get(local);
  if (targets !== undefined) {
    return `${local}=${targets.map((target) => `${target.file}#${target.name}`).join('|')}`;
  }
  return local === scope.name ? undefined : localReference(local, scope);
}

export function definitionKey(definition, { file, parsed, bindings }) {
  const others = new Map(
    parsed.definitions.filter((other) => other !== definition).map((other) => [other.name, other]),
  );
  const { start, end, name } = definition;
  const scope = { file, others, declaredTypes: parsed.declaredTypes, bindings, name };
  const references = parsed.tokens
    .slice(start, end)
    .filter((_, offset) => !CALL_SEPARATORS.has(parsed.tokens[start + offset - 1]?.text))
    .flatMap((token) => namesOf(token).map((local) => referenceOf(local, scope)))
    .filter((reference) => reference !== undefined);
  return hash(`${definition.text}|${[...new Set(references)].sort().join(',')}`);
}
