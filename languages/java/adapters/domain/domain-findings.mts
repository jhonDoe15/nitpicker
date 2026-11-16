import { RULE_IDS } from '../../../../shared/policy.mjs';
import { listed as listedUntyped } from '../../../../shared/rules/features/feature-boundaries.mjs';
import {
  adapterMessage as adapterMessageUntyped,
  domainFinding as domainFindingUntyped,
  libraryMessage as libraryMessageUntyped,
  reachMessage as reachMessageUntyped,
} from '../../../../shared/rules/domain/domain-messages.mjs';
import { reachableIo, reachPath } from './domain-reach.mts';
import type {
  ClassEdge,
  ClassGraph,
  ClassEntry,
  DomainFinding,
  LibraryUse,
} from './domain-types.mts';
import { simpleName as simpleNameUntyped } from '../../ingest/class-names.mjs';
import { grouped, isAdapter, isDomain, libraryPackage } from './domain-roles.mts';
import { concernOf } from './infrastructure-classes.mts';
import { randomSourceCalls } from './random-sources.mts';
import { byText as byTextUntyped } from '../../../../shared/text-order/by-text.mjs';

const simpleName: (className: string) => string = simpleNameUntyped;
const byText: (left: string, right: string) => number = byTextUntyped;
type FindingSite = { rule: string; file: string; identity: string };

const domainFinding: (site: FindingSite, message: string) => DomainFinding = domainFindingUntyped;
const adapterMessage: (values: { owner: string; used: string; packageName: string }) => string =
  adapterMessageUntyped;
const libraryMessage: (
  rule: string,
  values: { owner: string; used: string; first: string | undefined },
) => string = libraryMessageUntyped;
const reachMessage: (values: {
  owner: string;
  path: string[];
  library: string;
  rule: string;
}) => string = reachMessageUntyped;
const listed: (items: readonly string[]) => string = listedUntyped;

function shownName(className: string): string {
  return simpleName(className)
    .replace(/__\w+$/u, '')
    .replaceAll('$', '.');
}

function distinct(values: readonly string[]): string {
  return listed([...new Set(values)].toSorted(byText));
}

function sortedFindings(findings: readonly DomainFinding[]): DomainFinding[] {
  return findings.toSorted((left, right) =>
    `${left.path}\0${left.rule}\0${left.identity}`.localeCompare(
      `${right.path}\0${right.rule}\0${right.identity}`,
    ),
  );
}

function adapterFindings(edges: readonly ClassEdge[]): DomainFinding[] {
  const uses = edges.filter(({ source, target }) => isDomain(source) && isAdapter(target));
  return grouped(uses, ({ source, target }) => `${source.file}\0${target.file}`).map((group) => {
    const [{ source, target }] = group;
    return domainFinding(
      {
        rule: RULE_IDS.domainImportsAdapter,
        file: source.file,
        identity: `domain-adapter:${target.file}`,
      },
      adapterMessage({
        owner: distinct(group.map((use) => simpleName(use.source.name))),
        used: distinct(group.map((use) => simpleName(use.target.name))),
        packageName: target.packageName,
      }),
    );
  });
}

function scannedUses(domainClasses: readonly ClassEntry[], projectRoot: string): LibraryUse[] {
  return [...grouped(domainClasses, ({ file }) => file)].flatMap((classes) =>
    randomSourceCalls(projectRoot, classes[0].file).flatMap(({ library, shown }) =>
      classes.map((source) => ({ source, library, shown, rule: RULE_IDS.domainImportsRandom })),
    ),
  );
}

function libraryUses({ classes, libraryEdges }: ClassGraph, projectRoot: string): LibraryUse[] {
  const direct = libraryEdges
    .filter(({ source }) => isDomain(source))
    .flatMap(({ source, library }) => {
      const concern = concernOf(library);
      return concern === undefined
        ? []
        : [{ source, library, shown: shownName(library), rule: concern.rule }];
    });
  return [...direct, ...scannedUses(classes.filter(isDomain), projectRoot)];
}

function libraryFindings(graph: ClassGraph, projectRoot: string): DomainFinding[] {
  const uses = libraryUses(graph, projectRoot);
  return grouped(
    uses,
    ({ source, rule, library }) => `${source.file}\0${rule}\0${libraryPackage(library)}`,
  ).map((group) => {
    const [{ source, rule, library }] = group;
    const shown = [...new Set(group.map((use) => use.shown))].toSorted(byText);
    return domainFinding(
      { rule, file: source.file, identity: `library:${libraryPackage(library)}` },
      libraryMessage(rule, {
        owner: distinct(group.map((use) => simpleName(use.source.name))),
        used: `${listed(shown)} (${libraryPackage(library)})`,
        first: shown[0],
      }),
    );
  });
}

function reachFindings(graph: ClassGraph): DomainFinding[] {
  const reach = reachableIo(graph);
  const steps = graph.edges.filter(
    ({ source, target }) => isDomain(source) && reach.next.has(target),
  );
  return grouped(steps, ({ source, target }) => `${source.file}\0${target.file}`).map((group) => {
    const [{ source, target }] = group;
    const { path, hit } = reachPath(target, reach);
    return domainFinding(
      {
        rule: RULE_IDS.domainReachesIo,
        file: source.file,
        identity: `domain-reach:${target.file}`,
      },
      reachMessage({
        owner: distinct(group.map((use) => simpleName(use.source.name))),
        path: path.map(({ name }) => simpleName(name)),
        library: shownName(hit.library),
        rule: hit.rule,
      }),
    );
  });
}

export function domainFindings(
  graph: ClassGraph,
  { projectRoot }: { projectRoot: string },
): DomainFinding[] {
  return sortedFindings([
    ...adapterFindings(graph.edges),
    ...libraryFindings(graph, projectRoot),
    ...reachFindings(graph),
  ]);
}
