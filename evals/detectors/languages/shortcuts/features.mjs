import path from 'node:path';
import { languageOf } from '../masking/mask.mjs';
import { lineOfIndex } from '../text.mjs';

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
const IMPORT_MODULE =
  /\b(?:importlib\s*\.\s*)?(?:import_module|__import__)\s*\(\s*(['"])([\w.]+)\1/gu;
const JVM_IMPORT = /^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+(?:\.\*)?)/gmu;
const JVM_PACKAGE = /^[ \t]*package[ \t]+([\w.]+)/mu;

const isPackage = (segment) => /^[a-z]/u.test(segment);
const packagesOfTrees = new WeakMap();

// The packages the project's own Java and Kotlin files declare.
function projectPackages(tree) {
  if (!packagesOfTrees.has(tree)) {
    const declared = [...tree]
      .filter(([file]) => ['java', 'kotlin'].includes(languageOf(file)))
      .map(([, text]) => JVM_PACKAGE.exec(text)?.[1]);
    packagesOfTrees.set(tree, new Set(declared.filter((name) => name !== undefined)));
  }
  return packagesOfTrees.get(tree);
}

const isProjectImport = (target, packages) =>
  [...packages].some((name) => target === name || target.startsWith(`${name}.`));

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

function jvmImports({ masked, tree }) {
  const packages = projectPackages(tree);
  return [...masked.matchAll(JVM_IMPORT)]
    .filter((match) => isProjectImport(match[1], packages))
    .map((match) => ({
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

// The segments a relative import names, from the importing file's directory (a `src` layout
// folder is not part of the package).
function absoluteSegments({ file, dots, module }) {
  const directory = path.posix.dirname(file).split('/');
  const base = dots === '' ? [] : directory.slice(0, directory.length - (dots.length - 1));
  const package_ = base[0] === 'src' ? base.slice(1) : base;
  return [...package_, ...module.split('.').filter((part) => part !== '')];
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

// Whether the project has the feature the segments name (so `lib.features.x` of a library is not).
function inProject({ segments, tree }) {
  const feature = inFeaturesPackage(segments);
  if (feature === undefined) return false;
  const directory = segments.slice(0, segments.indexOf(FEATURES_SEGMENT) + 2).join('/');
  return [...tree.keys()].some(
    (file) =>
      file.startsWith(`${directory}/`) ||
      file.includes(`/${directory}/`) ||
      file.includes(`/${directory}.py`),
  );
}

function pythonImports({ masked, kept, file, tree }) {
  const froms = [...masked.matchAll(PYTHON_FROM)].map((match) => {
    const segments = absoluteSegments({ file, dots: match[1], module: match[2] });
    const submodule = submoduleOf({ segments, names: importedNames(match[3]), tree });
    return { index: match.index, segments: submodule ? [...segments, submodule] : segments };
  });
  const plain = [...masked.matchAll(PYTHON_IMPORT)].flatMap((match) =>
    importedNames(match[1]).map((name) => ({ index: match.index, segments: name.split('.') })),
  );
  const dynamic = [...kept.matchAll(IMPORT_MODULE)]
    .filter((match) => masked[match.index] === kept[match.index])
    .map((match) => ({ index: match.index, segments: match[2].split('.') }));
  return [...froms, ...plain, ...dynamic]
    .filter(({ segments }) => inProject({ segments, tree }))
    .map(({ index, segments }) => {
      const feature = inFeaturesPackage(segments);
      return {
        target: segments.join('.'),
        line: lineOfIndex(masked, index),
        feature: { id: feature.name, internal: feature.rest.length > 0 },
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
 * detail }` with kind `cross-feature-import`. Only the project's own code counts: a Python import
 * of a feature the tree has, a Java or Kotlin import under a package the tree's files declare (so
 * `jakarta.persistence` or `kotlinx.coroutines.internal` never do). Python: features are the
 * packages under a `features` package (`pkg/features/billing/`); a feature's public API is its
 * `__init__`, so importing one of its modules (`pkg.features.billing.rules`, or `from
 * pkg.features.billing import rules`, or `importlib.import_module` of one) is internal. Java and
 * Kotlin: a feature is a package, with its public API in the top package and internals in
 * subpackages. Under a `features` package the subpackages of `features.billing` are internal;
 * otherwise the subpackages named `domain`, `adapters`, `adapter`, `internal`, `infrastructure`,
 * `impl`, `persistence` and `ports` are. A file may use the internals of its own feature. Callers
 * skip test files. `masked` has comments and strings blanked, `kept` only comments.
 */
export function crossFeatureImports({ language, file, masked, kept, tree }) {
  const importer = importerOf({ language, file, masked });
  const imports =
    language === 'python'
      ? pythonImports({ masked, kept, file, tree })
      : jvmImports({ masked, tree });
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
