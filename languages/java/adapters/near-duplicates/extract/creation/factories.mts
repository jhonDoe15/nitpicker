import type { Node } from 'web-tree-sitter';
import type {
  Attempt,
  CatchNames,
  ArgEnv,
  Factory,
  FactoryGroup,
  NamedSite,
  NamedTypeHole,
  Occurrence,
  Renderer,
  Shape,
  ShapeRequest,
  Site,
} from '../../extract-types.mts';
import { nameHoles } from '../../jvm-views.mts';
import { NO_SHAPE } from '../render.mts';
import { namedChildren, parentOf, present, required, squashed } from '../syntax.mts';
import { argumentTypes, declaredTypes, importsOf } from './arg-types.mts';
import { innerProblem, resultProblem, throwsProblem } from './factory-problems.mts';
import { boundsOf } from './result/bounds.mts';
import { interfaceName, interfaceText, nameClash } from './result/interface-names.mts';
import {
  catchProblem,
  catchText,
  isNotException,
  isUnchecked,
  siteOf,
} from './exceptions/catches.mts';

const ARGUMENTS =
  'the arguments of a constructor of a differing type have no type the shared code can write';
const SIGNATURES = 'the copies pass arguments of different types to a constructor';
const NOT_EXCEPTION = 'a differing catch type is not an Exception';
const NAMES = 'the shared code has no free names for its extra parameters';

function freshNames(stems: readonly string[], taken: ReadonlySet<string>): string[] | undefined {
  const named = nameHoles(
    stems.map((stem) => ({ stem })),
    taken,
    ({ stem }) => stem,
  );
  return named?.map(({ name }) => name);
}

function exceptionNames(count: number, taken: ReadonlySet<string>): string[] | undefined {
  const free = ['E', ...Array.from({ length: 30 }, (_, index) => `E${String(index + 2)}`)].filter(
    (name) => !taken.has(name),
  );
  return free.length < count ? undefined : free.slice(0, count);
}

function creationsOf(
  typeHoles: readonly NamedTypeHole[],
): { hole: NamedTypeHole; occurrence: Occurrence }[] {
  return typeHoles
    .filter(({ usage }) => usage === 'type')
    .flatMap((hole) =>
      hole.occurrences.flatMap((occurrence, index) =>
        hole.kinds[index] === 'creation' ? [{ hole, occurrence }] : [],
      ),
    );
}

function groupsOf(
  creations: readonly { hole: NamedTypeHole; occurrence: Occurrence }[],
  envs: readonly ArgEnv[],
): Attempt<{ groups: FactoryGroup[] }> {
  const groups = new Map<string, FactoryGroup>();
  for (const { hole, occurrence } of creations) {
    const types = [occurrence.a, occurrence.b].map((node, side) =>
      argumentTypes(parentOf(node), present(envs[side])),
    );
    const [first, second] = types;
    if (first === undefined || second === undefined) {
      return { declined: ARGUMENTS };
    }
    if (first.join('\u0000') !== second.join('\u0000')) {
      return { declined: SIGNATURES };
    }
    const key = `${hole.key}\u0000${first.join('\u0000')}`;
    const group = groups.get(key) ?? { hole, types: first, occurrences: [] };
    group.occurrences.push(occurrence);
    groups.set(key, group);
  }
  return { groups: [...groups.values()] };
}

function isInside(node: Node, outer: Node): boolean {
  return node.startIndex >= outer.startIndex && node.endIndex <= outer.endIndex;
}

function tiedSite(group: FactoryGroup, sites: readonly Site[]): Site | undefined {
  return sites
    .filter(({ body }) => isInside(present(group.occurrences[0]).a, body))
    .reduce<Site | undefined>(
      (best, site) =>
        best === undefined || site.body.startIndex > best.body.startIndex ? site : best,
      undefined,
    );
}

function analysed({
  methods,
  typeHoles,
  typeSources,
}: ShapeRequest): Attempt<{ groups: FactoryGroup[]; sites: Site[] }> {
  const creations = creationsOf(typeHoles);
  const envs = methods.map((method) => ({
    declared: declaredTypes(method),
    imports: importsOf(method.tree.rootNode),
  }));
  const found = groupsOf(creations, envs);
  const sites = typeHoles
    .filter(({ usage }) => usage === 'exception')
    .flatMap((hole) =>
      hole.occurrences.map((occurrence) => ({ hole, occurrence, ...siteOf(occurrence.a) })),
    );
  const ids = new Set(creations.map(({ occurrence }) => occurrence.a.id));
  if (found.declined !== undefined) {
    return { declined: found.declined };
  }
  const problem =
    (sites.some(({ hole }) => isNotException(hole)) ? NOT_EXCEPTION : undefined) ??
    creations.map(({ occurrence }) => resultProblem(parentOf(occurrence.a))).find(Boolean) ??
    innerProblem(methods, creations) ??
    sites
      .map((site) => catchProblem(site, ids, typeSources))
      .find((reason) => reason !== undefined);
  return problem === undefined ? { groups: found.groups, sites } : { declined: problem };
}

function rulesOf(
  { factories, sites }: { factories: readonly Factory[]; sites: readonly NamedSite[] },
  render: { unit: string; text: string; base: string },
): Map<number, Renderer> {
  const rules = new Map<number, Renderer>();
  for (const factory of factories) {
    for (const { a } of factory.occurrences) {
      rules.set(parentOf(a).id, (inner) => {
        const args = namedChildren(required(parentOf(a), 'arguments')).map(inner);
        return `${factory.parameter}.create(${args.join(', ')})`;
      });
    }
  }
  for (const site of sites) {
    const precise = factories.some(
      ({ untied, occurrences }) => untied && occurrences.some(({ a }) => isInside(a, site.body)),
    );
    const names: CatchNames = {
      failure: site.failure,
      caught: site.caught,
      type: site.hole.name,
      precise,
    };
    rules.set(site.clause.id, (inner) => catchText(site, { ...render, names }, inner));
  }
  return rules;
}

function sideOf(side: number): 'a' | 'b' {
  return side === 0 ? 'a' : 'b';
}

function parts(
  {
    factories,
    sites,
    exceptions,
  }: { factories: readonly Factory[]; sites: readonly NamedSite[]; exceptions: readonly string[] },
  render: { unit: string; text: string; base: string },
): Shape {
  return {
    rules: rulesOf({ factories, sites }, render),
    typeParams: [
      ...sites.map(({ hole }) => `${hole.name} extends Exception`),
      ...exceptions.map((name) => `${name} extends Exception`),
    ],
    lead: [],
    tail: [
      ...sites.map((site) => ({
        declaration: `Class<${site.hole.name}> ${site.failure}`,
        argument: (side: number) =>
          `${squashed(present(site.hole.occurrences[0])[sideOf(side)])}.class`,
      })),
      ...factories.map((factory) => ({
        declaration: `${factory.name}<${factory.hole.name}, ${factory.exception}> ${factory.parameter}`,
        argument: (side: number) =>
          `${squashed(present(factory.occurrences[0])[sideOf(side)])}::new`,
      })),
    ],
    throws: factories.filter(({ untied }) => untied).map(({ exception }) => exception),
    interfaces: [
      ...new Map(
        factories.map((factory) => [factory.name, interfaceText(factory, render)]),
      ).entries(),
    ].map(([name, text]) => ({ name, text })),
  };
}

function namesFor(
  groups: readonly FactoryGroup[],
  sites: readonly Site[],
  taken: ReadonlySet<string>,
): string[] | undefined {
  return freshNames(
    [...groups.map(() => 'creator'), ...sites.flatMap(() => ['failure', 'caught'])],
    taken,
  );
}

function factoriesOf(
  {
    groups,
    ties,
    names,
    exceptions,
  }: {
    groups: readonly FactoryGroup[];
    ties: readonly (Site | undefined)[];
    names: readonly string[];
    exceptions: readonly string[];
  },
  visibility: string,
): Factory[] {
  let free = 0;
  return groups.map((group, index) => {
    const tie = ties[index];
    return {
      ...group,
      name: interfaceName(group),
      parameter: present(names[index]),
      exception: tie === undefined ? present(exceptions[free++]) : tie.hole.name,
      untied: tie === undefined,
      visibility,
    };
  });
}

function sitesNamed(sites: readonly Site[], names: readonly string[], offset: number): NamedSite[] {
  return sites.map((site, index) => ({
    ...site,
    failure: present(names[offset + index * 2]),
    caught: present(names[offset + index * 2 + 1]),
  }));
}

function tiesOf(groups: readonly FactoryGroup[], sites: readonly Site[]): (Site | undefined)[] {
  return groups
    .map((group) => tiedSite(group, sites))
    .map((site) => (site === undefined || isUnchecked(site.hole) ? undefined : site));
}

function built(
  request: ShapeRequest,
  { groups, sites }: { groups: FactoryGroup[]; sites: Site[] },
  bounds: Map<string, string> | undefined,
): Attempt<Shape> {
  const { typeHoles, taken, visibility } = request;
  const ties = tiesOf(groups, sites);
  const unprovable = throwsProblem(groups, ties, request.typeSources);
  if (unprovable !== undefined) {
    return { declined: unprovable };
  }
  const used = new Set([...taken, ...typeHoles.map(({ name }) => name)]);
  const exceptions = exceptionNames(ties.filter((tie) => tie === undefined).length, used);
  const names = namesFor(groups, sites, taken);
  if (exceptions === undefined || names === undefined || nameClash(groups, taken)) {
    return { declined: NAMES };
  }
  const factories = factoriesOf({ groups, ties, names, exceptions }, visibility);
  const named = sitesNamed(sites, names, groups.length);
  return { ...parts({ factories, sites: named, exceptions }, request), bounds };
}

export function shapeOf(request: ShapeRequest): Attempt<Shape> {
  const found = analysed(request);
  if (found.declined !== undefined) {
    return found;
  }
  if (found.groups.length === 0 && found.sites.length === 0) {
    return NO_SHAPE;
  }
  const bounded = boundsOf(found.groups, request.typeHoles);
  return bounded.declined === undefined ? built(request, found, bounded.bounds) : bounded;
}
