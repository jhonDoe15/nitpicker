import { textOf } from '../../../../shared/values/readers.mts';
import { namesOf } from './source/jvm-tokens.mts';
import {
  type Bindings,
  type Entry,
  type Parsed,
  type ProjectIndex,
  type Target,
  type Token,
} from './jvm-reuse-types.mts';
import {
  CALL_SEPARATORS,
  MEMBER_SEPARATORS,
  named,
  typeFile,
  visibleTargets,
} from './jvm-references.mts';

type ImportFact = { from: string; to: string; names: { name: string; alias?: string }[] };
type Use = { file: string; name: string; alias?: string | undefined };
type UseContext = {
  readonly tokens: readonly Token[];
  readonly bindings: Bindings;
  readonly projectIndex: ProjectIndex;
  readonly module: string;
};

function chainAt(tokens: readonly Token[], index: number): string[] {
  const positions = [index];
  for (const position of positions) {
    const next = tokens[position + 2];
    if (MEMBER_SEPARATORS.has(tokens[position + 1]?.text) && next?.kind === 'identifier') {
      positions.push(position + 2);
    }
  }
  return positions.map((position) => tokens[position]?.text ?? '');
}

function typeUses(
  index: ProjectIndex,
  {
    fqn,
    name,
    member,
    module,
  }: { fqn: string; name: string; member: string | undefined; module: string },
): Use[] {
  const file = typeFile(index, fqn, module);
  const usesMember = member !== undefined && index.members.has(`${file}\0${name}.${member}`);
  return [
    { file, name, alias: fqn },
    ...(usesMember ? [{ file, name: `${name}.${member}`, alias: `${fqn}.${member}` }] : []),
  ];
}

function prefixUses(
  index: ProjectIndex,
  { chain, length, module }: { chain: string[]; length: number; module: string },
): Use[] {
  const fqn = chain.slice(0, length).join('.');
  const name = chain[length - 1] ?? '';
  if (index.types.has(fqn)) {
    return typeUses(index, { fqn, name, member: chain[length], module });
  }
  const packageName = chain.slice(0, length - 1).join('.');
  const topLevel = (index.packages.get(packageName)?.get(name) ?? []).filter(({ type }) => !type);
  return visibleTargets(topLevel, module).map(({ file }) => ({ file, name, alias: fqn }));
}

function qualifiedUses(index: ProjectIndex, chain: string[], module: string): Use[] {
  const lengths = chain.map((_, offset) => chain.length - offset).filter((length) => length >= 2);
  for (const length of lengths) {
    const uses = prefixUses(index, { chain, length, module });
    if (uses.length > 0) {
      return uses;
    }
  }
  return [];
}

function boundUses(
  index: ProjectIndex,
  {
    local,
    targets,
    member,
  }: { local: string; targets: readonly Target[]; member?: string | undefined },
): Use[] {
  return targets.flatMap((target) => {
    const own = { file: target.file, ...named(target.name, target.alias) };
    const memberName = `${target.name}.${textOf(member)}`;
    const usesMember =
      target.type === true &&
      member !== undefined &&
      index.members.has(`${target.file}\0${memberName}`);
    return usesMember
      ? [own, { file: target.file, ...named(memberName, `${local}.${member}`) }]
      : [own];
  });
}

function identifierUses(context: UseContext, index: number): Use[] {
  const { tokens, bindings, projectIndex: project, module } = context;
  const local = tokens[index]?.text ?? '';
  const targets = bindings.get(local) ?? [];
  if (CALL_SEPARATORS.has(tokens[index - 1]?.text)) {
    return boundUses(project, { local, targets: targets.filter(({ type }) => !type) });
  }
  const chain = chainAt(tokens, index);
  return targets.length === 0
    ? qualifiedUses(project, chain, module)
    : boundUses(project, { local, targets, member: chain[1] });
}

function usesAt(context: UseContext, index: number): Use[] {
  const token = context.tokens[index];
  if (token === undefined) {
    return [];
  }
  if (token.kind === 'identifier') {
    return identifierUses(context, index);
  }
  return namesOf(token).flatMap((local) =>
    boundUses(context.projectIndex, { local, targets: context.bindings.get(local) ?? [] }),
  );
}

function starImports(
  index: ProjectIndex,
  { parsed, module }: { parsed: Parsed; module: string },
): Use[] {
  return parsed.imports
    .filter((entry) => entry.wildcard && index.types.has(entry.path))
    .map((entry) => ({ file: typeFile(index, entry.path, module), name: '*' }));
}

function groupedByTarget(file: string, uses: readonly Use[]): ImportFact[] {
  const byTarget = new Map<string, Map<string, { name: string; alias?: string }>>();
  for (const { file: to, name, alias } of uses.filter((use) => use.file !== file)) {
    const names = byTarget.get(to) ?? new Map<string, { name: string; alias?: string }>();
    names.set(`${name}\0${alias ?? ''}`, named(name, alias));
    byTarget.set(to, names);
  }
  return [...byTarget].map(([to, names]) => ({ from: file, to, names: [...names.values()] }));
}

export function importFacts(
  index: ProjectIndex,
  { file, parsed, bindings, module }: Entry & { bindings: Bindings },
): ImportFact[] {
  const context = { tokens: parsed.tokens, bindings, projectIndex: index, module };
  const uses = [...parsed.tokens.keys()]
    .filter((position) => position >= parsed.headerEnd)
    .flatMap((position) => usesAt(context, position));
  return groupedByTarget(file, [...starImports(index, { parsed, module }), ...uses]);
}
