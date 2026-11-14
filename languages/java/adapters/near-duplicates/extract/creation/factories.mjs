import { nameHoles } from '../../../../../../shared/fix/recipes/extract/names.mjs';
import { NO_SHAPE } from '../render.mjs';
import { field, namedChildren, squashed } from '../syntax.mjs';
import { argumentTypes, declaredTypes, importsOf } from './arg-types.mjs';
import { boundsOf } from './result/bounds.mjs';
import { interfaceName, interfaceText, nameClash } from './result/interface-names.mjs';
import { catchProblem, catchText, isUnchecked, siteOf } from './catches.mjs';

const INNER = 'a constructor of a differing type is a member class that needs its outer instance';
const ARGUMENTS =
  'the arguments of a constructor of a differing type have no type the shared code can write';
const SIGNATURES = 'the copies pass arguments of different types to a constructor';
const RESULT =
  'a constructor of a differing type is used where its type matters: only a return, an assignment or a declared local may take it';
const NAMES = 'the shared code has no free names for its extra parameters';

function freshNames(stems, taken) {
  const named = nameHoles(
    stems.map((stem) => ({ stem })),
    taken,
    ({ stem }) => stem,
  );
  return named?.map(({ name }) => name);
}

function exceptionNames(count, taken) {
  const free = ['E', ...Array.from({ length: 30 }, (_, index) => `E${index + 2}`)].filter(
    (name) => !taken.has(name),
  );
  return free.length < count ? undefined : free.slice(0, count);
}

function creationsOf(typeHoles) {
  return typeHoles
    .filter(({ usage }) => usage === 'type')
    .flatMap((hole) =>
      hole.occurrences.flatMap((occurrence, index) =>
        hole.kinds[index] === 'creation' ? [{ hole, occurrence }] : [],
      ),
    );
}

function groupsOf(creations, envs) {
  const groups = new Map();
  for (const { hole, occurrence } of creations) {
    const types = [occurrence.a, occurrence.b].map((node, side) =>
      argumentTypes(node.parent, envs[side]),
    );
    if (types.includes(undefined)) {
      return { declined: ARGUMENTS };
    }
    if (types[0].join('\u0000') !== types[1].join('\u0000')) {
      return { declined: SIGNATURES };
    }
    const key = `${hole.key}\u0000${types[0].join('\u0000')}`;
    const group = groups.get(key) ?? { hole, types: types[0], occurrences: [] };
    group.occurrences.push(occurrence);
    groups.set(key, group);
  }
  return { groups: [...groups.values()] };
}

function resultProblem(creation) {
  const { parent } = creation;
  function isValue(key) {
    return field(parent, key)?.id === creation.id;
  }
  const takes =
    parent.type === 'return_statement' ||
    parent.type === 'expression_statement' ||
    (parent.type === 'assignment_expression' && isValue('right')) ||
    (parent.type === 'variable_declarator' &&
      isValue('value') &&
      squashed(field(parent.parent, 'type')) !== 'var');
  return takes ? undefined : RESULT;
}

function isInside(node, outer) {
  return node.startIndex >= outer.startIndex && node.endIndex <= outer.endIndex;
}

function tiedSite(group, sites) {
  return sites
    .filter(({ body }) => isInside(group.occurrences[0].a, body))
    .reduce(
      (best, site) =>
        best === undefined || site.body.startIndex > best.body.startIndex ? site : best,
      undefined,
    );
}

function innerProblem(methods, creations) {
  const inner = methods.map(
    (method) =>
      new Set(
        method.parent.namedChildren
          .filter(({ type }) => type === 'class_declaration')
          .map((member) => field(member, 'name').text),
      ),
  );
  const used = creations.flatMap(({ occurrence }) => [occurrence.a, occurrence.b].map(squashed));
  return used.some((text) => inner.some((names) => names.has(text))) ? INNER : undefined;
}

function analysed({ methods, typeHoles, readType }) {
  const creations = creationsOf(typeHoles);
  const envs = methods.map((method) => ({
    declared: declaredTypes(method),
    imports: importsOf(method.tree.rootNode),
  }));
  const found = groupsOf(creations, envs);
  const sites = typeHoles
    .filter(({ usage }) => usage === 'exception')
    .flatMap((hole) => hole.occurrences.map(({ a }) => ({ hole, ...siteOf(a) })));
  const ids = new Set(creations.map(({ occurrence }) => occurrence.a.id));
  const problem =
    found.declined ??
    creations.map(({ occurrence }) => resultProblem(occurrence.a.parent)).find(Boolean) ??
    innerProblem(methods, creations) ??
    sites.map((site) => catchProblem(site, ids, readType)).find((reason) => reason !== undefined);
  return problem === undefined ? { groups: found.groups, sites } : { declined: problem };
}

function rulesOf({ factories, sites }, render) {
  const rules = new Map();
  for (const factory of factories) {
    for (const { a } of factory.occurrences) {
      rules.set(a.parent.id, (inner) => {
        const args = namedChildren(field(a.parent, 'arguments')).map(inner);
        return `${factory.parameter}.create(${args.join(', ')})`;
      });
    }
  }
  for (const site of sites) {
    const precise = factories.some(
      ({ untied, occurrences }) => untied && occurrences.some(({ a }) => isInside(a, site.body)),
    );
    const names = { failure: site.failure, caught: site.caught, type: site.hole.name, precise };
    rules.set(site.clause.id, (inner) => catchText(site, { ...render, names }, inner));
  }
  return rules;
}

function sideOf(side) {
  return side === 0 ? 'a' : 'b';
}

function parts({ factories, sites, exceptions }, render) {
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
        argument: (side) => `${squashed(site.hole.occurrences[0][sideOf(side)])}.class`,
      })),
      ...factories.map((factory) => ({
        declaration: `${factory.name}<${factory.hole.name}, ${factory.exception}> ${factory.parameter}`,
        argument: (side) => `${squashed(factory.occurrences[0][sideOf(side)])}::new`,
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

function namesFor(groups, sites, taken) {
  return freshNames(
    [...groups.map(() => 'creator'), ...sites.flatMap(() => ['failure', 'caught'])],
    taken,
  );
}

function factoriesOf({ groups, ties, names, exceptions }, visibility) {
  let free = 0;
  return groups.map((group, index) => ({
    ...group,
    name: interfaceName(group),
    parameter: names[index],
    exception: ties[index] === undefined ? exceptions[free++] : ties[index].hole.name,
    untied: ties[index] === undefined,
    visibility,
  }));
}

function sitesNamed(sites, names, offset) {
  return sites.map((site, index) => ({
    ...site,
    failure: names[offset + index * 2],
    caught: names[offset + index * 2 + 1],
  }));
}

function tiesOf(groups, sites) {
  return groups
    .map((group) => tiedSite(group, sites))
    .map((site) => (site === undefined || isUnchecked(site.hole) ? undefined : site));
}

function built(request, { groups, sites }, bounds) {
  const { typeHoles, taken, visibility } = request;
  const ties = tiesOf(groups, sites);
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

export function shapeOf(request) {
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
