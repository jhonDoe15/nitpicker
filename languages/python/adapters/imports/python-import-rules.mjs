import { stronglyConnected } from '../../../../shared/graph/strongly-connected.mjs';
import { listed } from '../../../../shared/rules/features/feature-boundaries.mjs';
import { importEdges } from '../analysis/python-coupling.mjs';

const COUPLING_TOOL = 'coupling';
const PACKAGE_CYCLE_RULE = 'package-cycle';
const MODULE_CYCLE_RULE = 'no-production-cycles';
const OUTSIDE_ROOTS_RULE = 'no-import-outside-roots';
const NO_FEATURES = { explainedCycles: [], featureOf: () => undefined };

function packageOf(entry) {
  if (entry.isPackage) {
    return entry.module;
  }
  return entry.module.includes('.')
    ? entry.module.slice(0, entry.module.lastIndexOf('.'))
    : '(root)';
}

function isInside(name, owner) {
  return name === owner || name.startsWith(`${owner}.`);
}

function runtimeEdges({ modules, imports }) {
  return importEdges(modules, imports).filter(
    ({ source, target, kind }) => kind === 'runtime' && source !== target,
  );
}

function reExports(byName, source, target) {
  return byName.get(source).isPackage && isInside(target, source);
}

function packageEdges(byName, edges) {
  return edges
    .filter(({ source, target }) => !reExports(byName, source, target))
    .map(({ source, target }) => ({
      source: packageOf(byName.get(source)),
      target: packageOf(byName.get(target)),
      files: `${byName.get(source).file}\0${byName.get(target).file}`,
    }))
    .filter(({ source, target }) => source !== target);
}

function packageAnchors(modules) {
  const anchor = new Map();
  for (const entry of [...modules].sort((left, right) => left.file.localeCompare(right.file))) {
    if (!anchor.has(packageOf(entry)) || entry.module === packageOf(entry)) {
      anchor.set(packageOf(entry), entry.file);
    }
  }
  return anchor;
}

function staysCyclic(members, packaged, cycleEdges) {
  const inside = new Set(members);
  const removed = new Set(cycleEdges.map(({ from, to }) => `${from}\0${to}`));
  const rest = packaged.filter(
    ({ source, target, files }) => inside.has(source) && inside.has(target) && !removed.has(files),
  );
  return stronglyConnected(members, rest).length > 0;
}

function isExplained(members, { packaged, anchor, features }) {
  const directories = members.map((member) => features.featureOf(anchor.get(member)));
  if (directories.includes(undefined) || new Set(directories).size < 2) {
    return false;
  }
  return features.explainedCycles.some(
    (cycle) =>
      directories.every((directory) => cycle.features.includes(directory)) &&
      !staysCyclic(members, packaged, cycle.edges),
  );
}

function packageCycles(modules, edges, features) {
  const byName = new Map(modules.map((entry) => [entry.module, entry]));
  const packaged = packageEdges(byName, edges);
  const anchor = packageAnchors(modules);
  return stronglyConnected([...anchor.keys()], packaged)
    .filter((members) => !isExplained(members, { packaged, anchor, features }))
    .flatMap((members) =>
      members.map((member) => ({
        tool: COUPLING_TOOL,
        rule: PACKAGE_CYCLE_RULE,
        path: anchor.get(member),
        identity: `cycle:${member}`,
        message: `Package ${member} is in a dependency cycle with ${listed(members.filter((other) => other !== member))}. Move the shared types down into one of them, or invert one dependency behind an interface`,
        classification: 'enforceable',
      })),
    );
}

function moduleCycles(modules, edges) {
  const byName = new Map(modules.map((entry) => [entry.module, entry]));
  const samePackage = edges.filter(
    ({ source, target }) =>
      !reExports(byName, source, target) &&
      packageOf(byName.get(source)) === packageOf(byName.get(target)),
  );
  return stronglyConnected([...byName.keys()], samePackage).flatMap((members) =>
    members.map((member) => ({
      tool: COUPLING_TOOL,
      rule: MODULE_CYCLE_RULE,
      path: byName.get(member).file,
      identity: `module-cycle:${member}`,
      message: `Module ${member} is in an import cycle with ${listed(members.filter((other) => other !== member))}. Move what they share into a module both import, or pass it in instead of importing it back`,
      classification: 'enforceable',
    })),
  );
}

export function cycleFindings(report, features = NO_FEATURES) {
  const edges = runtimeEdges(report);
  return [
    ...packageCycles(report.modules, edges, features),
    ...moduleCycles(report.modules, edges),
  ];
}

function outsideTarget(statement, outside) {
  if (statement.level !== 0) {
    return [];
  }
  const names =
    statement.module === null
      ? statement.names
      : [statement.module, ...statement.names.map((name) => `${statement.module}.${name}`)];
  const found = names.flatMap((name) => {
    const parts = name.split('.');
    return parts
      .map((_, index) => parts.slice(0, parts.length - index).join('.'))
      .filter((candidate) => outside.has(candidate));
  });
  return found.length === 0 ? [] : [found.sort((left, right) => right.length - left.length)[0]];
}

export function outsideRootsFindings({ modules, others = [], imports }) {
  const production = new Set(modules.map(({ module }) => module.split('.')[0]));
  const outside = new Map(
    others
      .filter(({ inRoots, module }) => !inRoots && !production.has(module.split('.')[0]))
      .map((entry) => [entry.module, entry]),
  );
  return modules.flatMap((importer) => {
    const targets = (imports[importer.file] ?? []).flatMap((statement) =>
      outsideTarget(statement, outside),
    );
    return [...new Set(targets)].map((target) => ({
      tool: COUPLING_TOOL,
      rule: OUTSIDE_ROOTS_RULE,
      path: importer.file,
      identity: `outside-roots:${target}`,
      message: `${importer.module} imports ${target} from ${outside.get(target).file}, outside the source roots. Production code imports only from python.sourceRoots: move the imported code under a source root, or add its folder to "python.sourceRoots" so the gate checks it`,
      classification: 'enforceable',
    }));
  });
}
