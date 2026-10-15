import { escapeRegExp } from '../../../../../shared/glob.mjs';

export const NO_IMPORT_OUTSIDE_ROOTS = 'no-import-outside-roots';

const EXCEPTION_ROUTE =
  'Move it under a source root, add its folder to layout.sourceRoots, or list it in "exclude" in nitpicker.config.json.';
const NON_PROJECT_DEPENDENCIES = [
  'core',
  'npm',
  'npm-dev',
  'npm-optional',
  'npm-peer',
  'npm-bundled',
  'npm-no-pkg',
  'npm-unknown',
  'unknown',
  'undetermined',
];

export function outsideRootsRule({ productionSource, roots, excludePattern }) {
  const insideRoots = `^(?:${roots.map(escapeRegExp).join('|')})/`;
  return {
    name: NO_IMPORT_OUTSIDE_ROOTS,
    severity: 'error',
    from: { path: productionSource },
    to: {
      pathNot: [insideRoots, '(?:^|/)node_modules/', '\\.json$', excludePattern]
        .filter((pattern) => pattern !== undefined)
        .join('|'),
      dependencyTypesNot: NON_PROJECT_DEPENDENCIES,
    },
  };
}

export function architectureMessage(rule, { from, to, cycle }) {
  if (cycle !== undefined) {
    return `Dependency cycle: ${cycle.join(' -> ')} -> ${cycle[0]}`;
  }
  const message = `${from} must not depend on ${to}`;
  return rule === NO_IMPORT_OUTSIDE_ROOTS
    ? `${message}: production code imports only from layout.sourceRoots. ${EXCEPTION_ROUTE}`
    : message;
}
