import { importEdge } from '../../plan-parts/edge.mjs';
import { allowedFormOf, without } from '../../plan-parts/finding.mjs';
import { ALL_PRESETS, PYTHON_PRESETS, TYPESCRIPT_PRESETS } from '../../plan-parts/presets.mjs';
import { stepsOf } from '../../plan-parts/steps.mjs';

const PACKAGE_EDGE = /^package-edge:(.+?)->(.+)$/u;
const CYCLE = /cycle: ([^)]+)\)/u;
const ARROW = /\s*(?:->|→)\s*/u;

function edgeOf(finding, env) {
  const named = PACKAGE_EDGE.exec(finding.identity);
  if (named !== null) {
    return { from: named[1], to: named[2] };
  }
  return importEdge(finding, env);
}

function cycleOf(finding) {
  return CYCLE.exec(finding.message)?.[1]?.split(ARROW);
}

function targetFor(finding, edge) {
  const line = edge?.line ?? finding.location?.line ?? 1;
  return { path: finding.path, startLine: line, endLine: line };
}

function edgeText(edge) {
  if (edge === undefined) {
    return 'the import this finding points at';
  }
  return edge.specifier === undefined
    ? `${edge.from} -> ${edge.to}`
    : `${edge.from} -> ${edge.specifier}`;
}

function invertDependency(form) {
  return (finding, env) => {
    const edge = edgeOf(finding, env);
    const cycle = cycleOf(finding);
    return {
      kind: 'invert-dependency',
      target: targetFor(finding, edge),
      context: without({ edge, cycle }),
      steps: stepsOf(
        `Read the dependency ${edgeText(edge)}.`,
        cycle === undefined ? undefined : `It closes the cycle ${cycle.join(' -> ')}; cut it once.`,
        allowedFormOf(finding, form),
        'Update the imports of every file that used the old path, and run the tests.',
      ),
    };
  };
}

function moveModule(form) {
  return (finding, env) => {
    const edge = edgeOf(finding, env);
    return {
      kind: 'move-module',
      target: targetFor(finding, edge),
      context: without({ edge }),
      steps: stepsOf(
        `Read ${finding.path}${edge === undefined ? '' : `, which imports ${edge.specifier ?? edge.to}`}.`,
        allowedFormOf(finding, form),
        'Move the file with `git mv`, then update its imports and the imports of its users.',
      ),
    };
  };
}

function rule(tool, name) {
  return { tool, rule: name };
}
function coupling(name) {
  return rule('coupling', name);
}

function codingStandards(name) {
  return rule('coding-standards', name);
}

const COUPLING_FORM =
  'Move what both need to a shared root, or invert this import behind an interface.';

export const EDGE_BUILDERS = [
  {
    id: 'invert-stability-direction',
    rules: [coupling('stability-direction'), coupling('package-cycle')],
    presets: ALL_PRESETS,
    build: invertDependency(
      'Depend on an abstraction in a more stable package, or move the dependency inward.',
    ),
  },
  {
    id: 'invert-feature-dependency',
    rules: [
      coupling('feature-cycle'),
      coupling('feature-internal-import'),
      coupling('shared-imports-feature'),
    ],
    presets: ALL_PRESETS,
    build: invertDependency(COUPLING_FORM),
  },
  {
    id: 'invert-boundary-dependency',
    rules: [
      codingStandards('runtime-boundary/<rule>'),
      codingStandards('callback-protocol/<rule>'),
      codingStandards('public-contract-production-use'),
    ],
    presets: [...TYPESCRIPT_PRESETS, ...PYTHON_PRESETS],
    build: invertDependency(COUPLING_FORM),
  },
  {
    id: 'move-single-feature-module',
    rules: [coupling('shared-used-by-one-feature')],
    presets: ALL_PRESETS,
    build: moveModule('Move it into the one feature that uses it.'),
  },
  {
    id: 'move-typescript-source',
    rules: [rule('structure', 'javascript-in-typescript-project')],
    presets: ['typescript'],
    build: moveModule('Convert the file to TypeScript: rename it to .ts or .tsx and type it.'),
  },
];
