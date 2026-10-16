import { importEdges } from '../analysis/python-coupling.mjs';

const COUPLING_TOOL = 'coupling';
const PACKAGE_CYCLE_RULE = 'package-cycle';
const MODULE_CYCLE_RULE = 'no-production-cycles';
const OUTSIDE_ROOTS_RULE = 'no-import-outside-roots';
const LISTED_MEMBERS = 5;

export const IMPORT_RULE_IDS = [PACKAGE_CYCLE_RULE, MODULE_CYCLE_RULE, OUTSIDE_ROOTS_RULE];

function packageOf(entry) {
  if (entry.isPackage) return entry.module;
  return entry.module.includes('.')
    ? entry.module.slice(0, entry.module.lastIndexOf('.'))
    : '(root)';
}

function isInside(name, owner) {
  return name === owner || name.startsWith(`${owner}.`);
}

export function stronglyConnected(nodes, edges) {
  const next = new Map(nodes.map((node) => [node, []]));
  for (const { source, target } of edges) next.get(source)?.push(target);
  const state = { index: 0, indices: new Map(), low: new Map(), stack: [], onStack: new Set() };
  const components = [];
  const visit = (node) => {
    state.indices.set(node, state.index);
    state.low.set(node, state.index);
    state.index += 1;
    state.stack.push(node);
    state.onStack.add(node);
    for (const target of next.get(node) ?? []) {
      if (!state.indices.has(target)) {
        visit(target);
        state.low.set(node, Math.min(state.low.get(node), state.low.get(target)));
      } else if (state.onStack.has(target)) {
        state.low.set(node, Math.min(state.low.get(node), state.indices.get(target)));
      }
    }
    if (state.low.get(node) === state.indices.get(node)) {
      const component = [];
      for (let member = state.stack.pop(); ; member = state.stack.pop()) {
        state.onStack.delete(member);
        component.push(member);
        if (member === node) break;
      }
      components.push(component.sort());
    }
  };
  for (const node of [...nodes].sort()) if (!state.indices.has(node)) visit(node);
  return components.filter((component) => component.length > 1);
}

function listed(members) {
  const shown = members.slice(0, LISTED_MEMBERS).join(', ');
  return members.length > LISTED_MEMBERS
    ? `${shown} and ${String(members.length - LISTED_MEMBERS)} more`
    : shown;
}

function runtimeEdges({ modules, imports }) {
  return importEdges(modules, imports).filter(
    ({ source, target, kind }) => kind === 'runtime' && source !== target,
  );
}

// A package __init__ that imports its own submodules re-exports them; it is not a dependency.
function reExports(byName, source, target) {
  return byName.get(source).isPackage && isInside(target, source);
}

function packageCycles(modules, edges) {
  const byName = new Map(modules.map((entry) => [entry.module, entry]));
  const owner = (name) => packageOf(byName.get(name));
  const packaged = edges
    .filter(({ source, target }) => !reExports(byName, source, target))
    .map(({ source, target }) => ({ source: owner(source), target: owner(target) }))
    .filter(({ source, target }) => source !== target);
  const anchor = new Map();
  for (const entry of [...modules].sort((left, right) => left.file.localeCompare(right.file))) {
    if (!anchor.has(packageOf(entry)) || entry.module === packageOf(entry))
      anchor.set(packageOf(entry), entry.file);
  }
  return stronglyConnected([...anchor.keys()], packaged).flatMap((members) =>
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

export function cycleFindings(report) {
  const edges = runtimeEdges(report);
  return [...packageCycles(report.modules, edges), ...moduleCycles(report.modules, edges)];
}

function outsideTarget(statement, outside) {
  if (statement.level !== 0) return [];
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
