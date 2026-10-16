import { escapeRegExp } from '../../../../../shared/glob.mjs';
import { GENERATED_CODE_PATTERN } from '../../layout.mjs';

export const NO_IMPORT_OUTSIDE_ROOTS = 'no-import-outside-roots';

const OUTSIDE_ROOTS_COMMENT =
  'Production code imports only from layout.sourceRoots: move the imported code under a source root, or add its folder to layout.sourceRoots so the gate checks it. Excluding the imported file instead is a policy loosening that fails until a person accepts it.';
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
    comment: OUTSIDE_ROOTS_COMMENT,
    from: { path: productionSource },
    to: {
      pathNot: [
        insideRoots,
        '(?:^|/)node_modules/',
        GENERATED_CODE_PATTERN,
        '\\.json$',
        excludePattern,
      ]
        .filter((pattern) => pattern !== undefined)
        .join('|'),
      dependencyTypesNot: NON_PROJECT_DEPENDENCIES,
    },
  };
}
