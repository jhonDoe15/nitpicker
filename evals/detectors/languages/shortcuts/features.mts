import path from 'node:path';
import { capture } from '../../common/matches.mts';
import type { Language, Occurrence, Tree } from '../../common/types.mts';
import { languageOf } from '../masking/mask.mts';
import { lineOfIndex } from '../text.mts';

const FEATURES_SEGMENT = 'features';
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

type Feature = { id: string; internal: boolean };

type FeatureImport = { target: string; line: number; feature: Feature | undefined };

type FeaturesPackage = { id: string; name: string; rest: string[] };

function isPackage(segment: string): boolean {
  return /^[a-z]/u.test(segment);
}

const packagesOfTrees = new WeakMap<Tree, Set<string>>();

function projectPackages(tree: Tree): Set<string> {
  const known = packagesOfTrees.get(tree);
  if (known !== undefined) return known;
  const declared = [...tree]
    .filter(([file]) => {
      const language = languageOf(file);
      return language === 'java' || language === 'kotlin';
    })
    .map(([, text]) => JVM_PACKAGE.exec(text)?.[1]);
  const packages = new Set(declared.filter((name) => name !== undefined));
  packagesOfTrees.set(tree, packages);
  return packages;
}

function isProjectImport(target: string, packages: ReadonlySet<string>): boolean {
  return [...packages].some((name) => target === name || target.startsWith(`${name}.`));
}

function inFeaturesPackage(segments: readonly string[]): FeaturesPackage | undefined {
  const at = segments.indexOf(FEATURES_SEGMENT);
  const name = segments[at + 1];
  if (at === -1 || name === undefined) return undefined;
  const id = segments.slice(0, at + 2).join('.');
  return { id, name, rest: segments.slice(at + 2) };
}

function jvmFeatureOf(segments: readonly string[]): Feature | undefined {
  const named = inFeaturesPackage(segments);
  if (named !== undefined) {
    return { id: named.id, internal: named.rest.length >= 2 && isPackage(named.rest[0] ?? '') };
  }
  const at = segments.findIndex((segment) => INTERNAL_PACKAGES.has(segment));
  return at <= 0 ? undefined : { id: segments.slice(0, at).join('.'), internal: true };
}

function jvmImports({ masked, tree }: { masked: string; tree: Tree }): FeatureImport[] {
  const packages = projectPackages(tree);
  return [...masked.matchAll(JVM_IMPORT)]
    .filter((match) => isProjectImport(capture(match, 1), packages))
    .map((match) => ({
      target: capture(match, 1),
      line: lineOfIndex(masked, match.index),
      feature: jvmFeatureOf(capture(match, 1).split('.')),
    }));
}

function importedNames(list: string): string[] {
  return list
    .replaceAll(/[()]/gu, '')
    .split(',')
    .map(
      (part) =>
        part
          .trim()
          .split(/\s+as\s+/u)
          .at(0) ?? '',
    )
    .filter((name) => name !== '' && name !== '*');
}

function absoluteSegments({
  file,
  dots,
  module,
}: {
  file: string;
  dots: string;
  module: string;
}): string[] {
  const directory = path.posix.dirname(file).split('/');
  const base = dots === '' ? [] : directory.slice(0, directory.length - (dots.length - 1));
  const package_ = base[0] === 'src' ? base.slice(1) : base;
  return [...package_, ...module.split('.').filter((part) => part !== '')];
}

function submoduleOf({
  segments,
  names,
  tree,
}: {
  segments: readonly string[];
  names: readonly string[];
  tree: Tree;
}): string | undefined {
  const feature = inFeaturesPackage(segments);
  if (feature === undefined || feature.rest.length > 0) return undefined;
  const directory = `${FEATURES_SEGMENT}/${feature.name}/`;
  const files = [...tree.keys()];
  function isModule(name: string): boolean {
    return files.some(
      (file) => file.includes(`${directory}${name}.py`) || file.includes(`${directory}${name}/`),
    );
  }
  return names.find(isModule);
}

function inProject({ segments, tree }: { segments: readonly string[]; tree: Tree }): boolean {
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

type ImportSite = { index: number; segments: string[] };

function pythonImports({
  masked,
  kept,
  file,
  tree,
}: {
  masked: string;
  kept: string;
  file: string;
  tree: Tree;
}): FeatureImport[] {
  const froms = [...masked.matchAll(PYTHON_FROM)].map((match): ImportSite => {
    const segments = absoluteSegments({ file, dots: capture(match, 1), module: capture(match, 2) });
    const submodule = submoduleOf({ segments, names: importedNames(capture(match, 3)), tree });
    return { index: match.index, segments: submodule ? [...segments, submodule] : segments };
  });
  const plain = [...masked.matchAll(PYTHON_IMPORT)].flatMap((match) =>
    importedNames(capture(match, 1)).map((name): ImportSite => ({
      index: match.index,
      segments: name.split('.'),
    })),
  );
  const dynamic = [...kept.matchAll(IMPORT_MODULE)]
    .filter((match) => masked[match.index] === kept[match.index])
    .map((match): ImportSite => ({ index: match.index, segments: capture(match, 2).split('.') }));
  return [...froms, ...plain, ...dynamic]
    .filter(({ segments }) => inProject({ segments, tree }))
    .flatMap(({ index, segments }) => {
      const feature = inFeaturesPackage(segments);
      return feature === undefined
        ? []
        : [
            {
              target: segments.join('.'),
              line: lineOfIndex(masked, index),
              feature: { id: feature.name, internal: feature.rest.length > 0 },
            },
          ];
    });
}

function importerOf({
  language,
  file,
  masked,
}: {
  language: Language;
  file: string;
  masked: string;
}): string | undefined {
  if (language !== 'python') {
    return JVM_PACKAGE.exec(masked)?.[1] ?? path.posix.dirname(file).replaceAll('/', '.');
  }
  return inFeaturesPackage(file.replace(/\.py$/u, '').split('/'))?.name;
}

function isOwn({
  importer,
  feature,
  language,
}: {
  importer: string | undefined;
  feature: string;
  language: Language;
}): boolean {
  return (
    importer !== undefined &&
    (language === 'python'
      ? importer === feature
      : importer === feature || importer.startsWith(`${feature}.`))
  );
}

export function crossFeatureImports({
  language,
  file,
  masked,
  kept,
  tree,
}: {
  language: Language;
  file: string;
  masked: string;
  kept: string;
  tree: Tree;
}): Occurrence[] {
  const importer = importerOf({ language, file, masked });
  const imports =
    language === 'python'
      ? pythonImports({ masked, kept, file, tree })
      : jvmImports({ masked, tree });
  const importerName = importer ?? 'a file outside any feature';
  return imports.flatMap(({ target, line, feature }) =>
    feature?.internal === true && !isOwn({ importer, feature: feature.id, language })
      ? [
          {
            kind: 'cross-feature-import',
            key: target,
            line,
            detail: `${importerName} imports ${target}, internals of feature ${feature.id}; use its public API instead`,
          },
        ]
      : [],
  );
}
