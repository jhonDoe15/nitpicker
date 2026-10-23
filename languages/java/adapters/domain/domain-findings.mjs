import { RULE_IDS } from '../../../../shared/policy.mjs';
import { listed } from '../../../../shared/rules/features/feature-boundaries.mjs';
import { adapterMessage, domainFinding, libraryMessage, reachMessage } from './domain-messages.mjs';
import { reachableIo, reachPath } from './domain-reach.mjs';
import { simpleName } from '../features/class-graph.mjs';
import { grouped, isAdapter, isDomain, libraryPackage } from './domain-roles.mjs';
import { concernOf } from './infrastructure-classes.mjs';
import { randomSourceCalls } from './random-sources.mjs';

function shownName(className) {
  return simpleName(className)
    .replace(/__\w+$/u, '')
    .replaceAll('$', '.');
}

function distinct(values) {
  return listed([...new Set(values)].sort());
}

function sortedFindings(findings) {
  return findings.toSorted((left, right) =>
    `${left.path}\0${left.rule}\0${left.identity}`.localeCompare(
      `${right.path}\0${right.rule}\0${right.identity}`,
    ),
  );
}

function adapterFindings(edges) {
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

function scannedUses(domainClasses, projectRoot) {
  return [...grouped(domainClasses, ({ file }) => file)].flatMap((classes) =>
    randomSourceCalls(projectRoot, classes[0].file).flatMap(({ library, shown }) =>
      classes.map((source) => ({ source, library, shown, rule: RULE_IDS.domainImportsRandom })),
    ),
  );
}

function libraryUses({ classes, libraryEdges }, projectRoot) {
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

function libraryFindings(graph, projectRoot) {
  const uses = libraryUses(graph, projectRoot);
  return grouped(
    uses,
    ({ source, rule, library }) => `${source.file}\0${rule}\0${libraryPackage(library)}`,
  ).map((group) => {
    const [{ source, rule, library }] = group;
    const shown = [...new Set(group.map((use) => use.shown))].sort();
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

function reachFindings(graph) {
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

export function domainFindings(graph, { projectRoot }) {
  return sortedFindings([
    ...adapterFindings(graph.edges),
    ...libraryFindings(graph, projectRoot),
    ...reachFindings(graph),
  ]);
}
