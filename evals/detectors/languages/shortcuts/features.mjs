import path from 'node:path';
import { lineOfIndex } from '../occurrences.mjs';

const FEATURES_SEGMENT = 'features';
// Subpackages that hold a JVM feature's internals when the project has no `features` package.
const INTERNAL_PACKAGES = new Set([
  'domain',
  'adapters',
  'adapter',
  'internal',
  'infrastructure',
  'impl',
  'persistence',
  'ports',
]);
const PYTHON_FROM = /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n]*)/gmu;
const PYTHON_IMPORT = /^[ \t]*import[ \t]+([\w., \t]+)/gmu;
const JVM_IMPORT = /^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+(?:\.\*)?)/gmu;
const JVM_PACKAGE = /^[ \t]*package[ \t]+([\w.]+)/mu;

const isPackage = (segment) => /^[a-z]/u.test(segment);

// The feature a list of package or path segments is in: the one after `features`, if any.
function inFeaturesPackage(segments) {
  const at = segments.indexOf(FEATURES_SEGMENT);
  if (at === -1 || segments[at + 1] === undefined) return undefined;
  const id = segments.slice(0, at + 2).join('.');
  return { id, name: segments[at + 1], rest: segments.slice(at + 2) };
}

// The feature a JVM import reaches into and whether it reaches past its top package.
function jvmFeatureOf(segments) {
  const named = inFeaturesPackage(segments);
  if (named !== undefined) {
    return { id: named.id, internal: named.rest.length >= 2 && isPackage(named.rest[0]) };
  }
  const at = segments.findIndex((segment) => INTERNAL_PACKAGES.has(segment));
  return at <= 0 ? undefined : { id: segments.slice(0, at).join('.'), internal: true };
}

function jvmImports({ masked }) {
  return [...masked.matchAll(JVM_IMPORT)].map((match) => ({
    target: match[1],
    line: lineOfIndex(masked, match.index),
    feature: jvmFeatureOf(match[1].split('.')),
  }));
}

function importedNames(list) {
  return list
    .replaceAll(/[()]/gu, '')
    .split(',')
    .map((part) => part.trim().split(/\s+as\s+/u)[0])
    .filter((name) => name !== '' && name !== '*');
}

// The segments a relative import names, from the importing file's directory.
function absoluteSegments({ file, dots, module }) {
  const directory = path.posix.dirname(file).split('/');
  const base = dots === '' ? [] : directory.slice(0, directory.length - (dots.length - 1));
  return [...base, ...module.split('.').filter((part) => part !== '')];
}

// The name in `from pkg.features.billing import name` when it is a module of the feature rather
// than something its package exports.
function submoduleOf({ segments, names, tree }) {
  const feature = inFeaturesPackage(segments);
  if (feature === undefined || feature.rest.length > 0) return undefined;
  const directory = `${FEATURES_SEGMENT}/${feature.name}/`;
  const files = [...tree.keys()];
  const isModule = (name) =>
    files.some(
      (file) => file.includes(`${directory}${name}.py`) || file.includes(`${directory}${name}/`),
    );
  return names.find(isModule);
}

function pythonImports({ masked, file, tree }) {
  const froms = [...masked.matchAll(PYTHON_FROM)].map((match) => {
    const segments = absoluteSegments({ file, dots: match[1], module: match[2] });
    const submodule = submoduleOf({ segments, names: importedNames(match[3]), tree });
    return { match, segments: submodule === undefined ? segments : [...segments, submodule] };
  });
  const plain = [...masked.matchAll(PYTHON_IMPORT)].flatMap((match) =>
    importedNames(match[1]).map((name) => ({ match, segments: name.split('.') })),
  );
  return [...froms, ...plain].map(({ match, segments }) => {
    const feature = inFeaturesPackage(segments);
    return {
      target: segments.join('.'),
      line: lineOfIndex(masked, match.index),
      feature: feature && { id: feature.name, internal: feature.rest.length > 0 },
    };
  });
}

// Where the importing file lives: its feature (Python) or its package (Java and Kotlin).
function importerOf({ language, file, masked }) {
  if (language !== 'python') {
    return JVM_PACKAGE.exec(masked)?.[1] ?? path.posix.dirname(file).replaceAll('/', '.');
  }
  return inFeaturesPackage(file.replace(/\.py$/u, '').split('/'))?.name;
}

const isOwn = ({ importer, feature, language }) =>
  importer !== undefined &&
  (language === 'python'
    ? importer === feature
    : importer === feature || importer.startsWith(`${feature}.`));

/**
 * The imports in a source file that reach into another feature's internals, as `{ kind, key, line,
 * detail }` with kind `cross-feature-import`. Python: features are the packages under a `features`
 * package (`pkg/features/billing/`); a feature's public API is its `__init__`, so importing one of
 * its modules (`pkg.features.billing.rules`, or `from pkg.features.billing import rules`) is
 * internal. Java and Kotlin: a feature is a package, with its public API in the top package and
 * internals in subpackages. Under a `features` package the subpackages of `features.billing` are
 * internal; otherwise the subpackages named `domain`, `adapters`, `adapter`, `internal`,
 * `infrastructure`, `impl`, `persistence` and `ports` are. A file may use the internals of its own
 * feature. Callers skip test files.
 */
export function crossFeatureImports({ language, file, masked, tree }) {
  const importer = importerOf({ language, file, masked });
  const imports =
    language === 'python' ? pythonImports({ masked, file, tree }) : jvmImports({ masked });
  return imports
    .filter(
      ({ feature }) =>
        feature?.internal === true && !isOwn({ importer, feature: feature.id, language }),
    )
    .map(({ target, line, feature }) => ({
      kind: 'cross-feature-import',
      key: target,
      line,
      detail: `${importer ?? 'a file outside any feature'} imports ${target}, internals of feature ${feature.id}; use its public API instead`,
    }));
}
