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

export function projectIndex(files) {
  const types = new Map();
  const packages = new Map();
  const members = new Set();
  for (const { file, parsed, module } of files) {
    const declared = packages.get(parsed.packageName) ?? new Map();
    packages.set(parsed.packageName, declared);
    for (const { name, kind, owner } of parsed.definitions) {
      if (owner !== undefined) {
        members.add(`${file}\0${owner}.${name}`);
        continue;
      }
      const type = TYPE_KINDS.has(kind);
      if (type) {
        const fqn = qualified(parsed.packageName, name);
        types.set(fqn, [...(types.get(fqn) ?? []), { file, module }]);
      }
      const targets = declared.get(name) ?? [];
      if (!targets.some((target) => target.file === file)) {
        declared.set(name, [...targets, { file, name, type, module }]);
      }
    }
  }
  return { types, packages, members };
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

function explicitTargets(index, entry, module) {
  const name = lastSegment(entry.path);
  const local = entry.alias ?? name;
  const parent = parentOf(entry.path);
  if (index.types.has(entry.path)) {
    return [{ file: typeFile(index, entry.path, module), ...named(name, local), type: true }];
  }
  const topLevel = (index.packages.get(parent)?.get(name) ?? []).filter(({ type }) => !type);
  if (topLevel.length > 0) {
    return visibleTargets(topLevel, module).map(({ file }) => ({
      file,
      ...named(name, local),
      type: false,
    }));
  }
  return index.types.has(parent)
    ? [
        {
          file: typeFile(index, parent, module),
          name: `${lastSegment(parent)}.${name}`,
          alias: local,
          type: false,
        },
      ]
    : [];
}

export function fileBindings(index, { file, parsed, module }) {
  const own = new Set(
    parsed.definitions.filter(({ owner }) => owner === undefined).map(({ name }) => name),
  );
  const bindings = new Map();
  const wildcards = parsed.imports.filter((entry) => entry.wildcard && !entry.static);
  for (const entry of wildcards.toReversed()) {
    const scope = { packageName: entry.path, file, own, module };
    for (const [name, targets] of packageBindings(index, scope)) {
      bindings.set(name, targets);
    }
  }
  const ownPackage = { packageName: parsed.packageName, file, own, module };
  for (const [name, targets] of packageBindings(index, ownPackage)) {
    bindings.set(name, targets);
  }
  const explicit = new Map();
  for (const entry of parsed.imports.filter(({ wildcard }) => !wildcard)) {
    const local = entry.alias ?? lastSegment(entry.path);
    explicit.set(local, [...(explicit.get(local) ?? []), ...explicitTargets(index, entry, module)]);
  }
  for (const [local, targets] of explicit) {
    if (targets.length > 0) {
      bindings.set(local, targets);
    }
  }
  for (const name of parsed.declaredTypes) {
    bindings.delete(name);
  }
  return bindings;
}

function chainAt(tokens, index) {
  const chain = [tokens[index].text];
  let end = index;
  while (MEMBER_SEPARATORS.has(tokens[end + 1]?.text) && tokens[end + 2]?.kind === 'identifier') {
    chain.push(tokens[end + 2].text);
    end += 2;
  }
  return chain;
}

function qualifiedUses(index, chain, module) {
  for (let length = chain.length; length >= 2; length -= 1) {
    const fqn = chain.slice(0, length).join('.');
    const name = chain[length - 1];
    if (index.types.has(fqn)) {
      const file = typeFile(index, fqn, module);
      const member = chain[length];
      return [
        { file, name, alias: fqn },
        ...(member !== undefined && index.members.has(`${file}\0${name}.${member}`)
          ? [{ file, name: `${name}.${member}`, alias: `${fqn}.${member}` }]
          : []),
      ];
    }
    const topLevel = index.packages.get(chain.slice(0, length - 1).join('.'))?.get(name) ?? [];
    if (topLevel.some(({ type }) => !type)) {
      return visibleTargets(
        topLevel.filter(({ type }) => !type),
        module,
      ).map(({ file }) => ({ file, name, alias: fqn }));
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

function usesAt(context, index) {
  const { tokens, bindings, projectIndex: project, module } = context;
  const token = tokens[index];
  if (token.kind === 'string') {
    return namesOf(token).flatMap((local) =>
      boundUses(project, { local, targets: bindings.get(local) ?? [] }),
    );
  }
  if (token.kind !== 'identifier') {
    return [];
  }
  const targets = bindings.get(token.text) ?? [];
  if (CALL_SEPARATORS.has(tokens[index - 1]?.text)) {
    const calls = targets.filter(({ type }) => !type);
    return boundUses(project, { local: token.text, targets: calls });
  }
  const chain = chainAt(tokens, index);
  if (targets.length === 0) {
    return qualifiedUses(project, chain, module);
  }
  return boundUses(project, { local: token.text, targets, member: chain[1] });
}

function starImports(index, { parsed, module }) {
  return parsed.imports
    .filter((entry) => entry.wildcard && index.types.has(entry.path))
    .map((entry) => ({ file: typeFile(index, entry.path, module), name: '*' }));
}

export function importFacts(index, { file, parsed, bindings, module }) {
  const context = { tokens: parsed.tokens, bindings, projectIndex: index, module };
  const uses = [...starImports(index, { parsed, module })];
  for (let position = parsed.headerEnd; position < parsed.tokens.length; position += 1) {
    uses.push(...usesAt(context, position));
  }
  const byTarget = new Map();
  for (const { file: to, name, alias } of uses.filter((use) => use.file !== file)) {
    const names = byTarget.get(to) ?? new Map();
    names.set(`${name}\0${alias ?? ''}`, named(name, alias));
    byTarget.set(to, names);
  }
  return [...byTarget].map(([to, names]) => ({ from: file, to, names: [...names.values()] }));
}

function localReference(local, { file, others, declaredTypes }) {
  const other = others.get(local);
  if (other?.kind === 'const' && other.literal === true) {
    return `${local}=literal:${other.text}`;
  }
  return other !== undefined || declaredTypes.has(local) ? `${local}=${file}` : undefined;
}

export function definitionKey(definition, { file, parsed, bindings }) {
  const others = new Map(
    parsed.definitions.filter((other) => other !== definition).map((other) => [other.name, other]),
  );
  const scope = { file, others, declaredTypes: parsed.declaredTypes };
  const free = new Set();
  for (let position = definition.start; position < definition.end; position += 1) {
    if (CALL_SEPARATORS.has(parsed.tokens[position - 1]?.text)) {
      continue;
    }
    for (const local of namesOf(parsed.tokens[position])) {
      const targets = bindings.get(local);
      const reference =
        targets === undefined
          ? local === definition.name
            ? undefined
            : localReference(local, scope)
          : `${local}=${targets.map((target) => `${target.file}#${target.name}`).join('|')}`;
      if (reference !== undefined) {
        free.add(reference);
      }
    }
  }
  return hash(`${definition.text}|${[...free].sort().join(',')}`);
}
