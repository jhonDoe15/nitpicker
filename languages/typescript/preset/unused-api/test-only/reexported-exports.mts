import path from 'node:path';
import { codeFilesUnder, walkRules } from '../program.mts';
import { publicEntryGlobs } from '../workspace/entries.mts';
import type { PackagesInfo, ProgramLayout } from '../workspace/workspace-types.mts';
import { entriesOf, keyOf } from './knip-report.mts';
import type { KnipItem, KnipReport } from './typed/knip-types.mts';
import { layoutProductionMatcher } from './production-config.mts';
import { type ProductionLayout, globMatcher, toPosix } from './typed/layout-views.mts';
import { exportLineOf, lazily, projectModules } from './project-modules.mts';
import { EVERYTHING, NAMED_EXPORTS, isCovered, reexportGraph } from './reexport-graph.mts';
import type { Chain, GraphNode, Reference, ResolvedModule } from './typed/graph-types.mts';

export type ReexportLayout = ProgramLayout &
  ProductionLayout & { readonly entryPoints?: readonly string[] };

type Walk = (
  directories: readonly string[],
  layout: ReexportLayout,
  projectRoot: string,
) => string[];

type WalkRules = ReturnType<typeof walkRules>;

type Group = [Candidate, ...Candidate[]];

function isNonEmpty(group: Candidate[]): group is Group {
  return group.length > 0;
}

type Candidate = {
  readonly file: string;
  readonly name: string;
  readonly chain: Chain;
  readonly item?: KnipItem;
};

type Revealed = { readonly item: KnipItem; readonly file: string; readonly name: string };

type Known = {
  readonly listed: ReadonlySet<string>;
  readonly revealed: ReadonlyMap<string, Revealed>;
};

export type Options = {
  readonly projectRoot: string;
  readonly entryPatterns: readonly string[];
  readonly packagesInfo: PackagesInfo;
  readonly layout: ReexportLayout;
  readonly production: KnipReport;
  readonly entryExportsRun: () => KnipReport;
  readonly walk?: Walk;
};

type ModuleOf = (file: string) => ResolvedModule;
type Graph = ReturnType<typeof reexportGraph>;
type Project = ReturnType<typeof projectOf>;

function filesMatching(files: readonly string[], globs: readonly string[]): string[] {
  const matchers = globs.filter((glob) => !glob.startsWith('!')).map((glob) => globMatcher(glob));
  return files.filter((file) => matchers.some((matcher) => matcher.test(file)));
}

function slotOf(file: string, name: string): string {
  return `${file}\0${name}`;
}

function isWildcard(name: string): boolean {
  return name === EVERYTHING || name === NAMED_EXPORTS;
}

function staticBase(glob: string): { path: string; isFile: boolean } {
  const segments = glob.split('/');
  const dynamic = segments.findIndex((segment) => /[*?{]/u.test(segment));
  return dynamic === -1
    ? { path: glob, isFile: true }
    : { path: segments.slice(0, dynamic).join('/'), isFile: false };
}

function filesNear(
  globs: readonly string[],
  {
    layout,
    walk,
    rules,
    projectRoot,
  }: { layout: ReexportLayout; walk: Walk; rules: WalkRules; projectRoot: string },
): string[] {
  const bases = globs.map(staticBase);
  const named = bases.filter(({ isFile }) => isFile).map(({ path: file }) => file);
  const directories = new Set(bases.filter(({ isFile }) => !isFile).map(({ path: dir }) => dir));
  return [
    ...named.filter((file) => rules.isFile(file)),
    ...walk(
      [...directories].filter((dir) => rules.isDirectory(dir)),
      layout,
      projectRoot,
    ).map(toPosix),
  ];
}

function entryFilesOf(
  { projectRoot, entryPatterns, packagesInfo, layout }: Options,
  walk: Walk,
): string[] {
  const manifestGlobs = packagesInfo.packages.flatMap((entry) => publicEntryGlobs(entry, layout));
  const configured = [...entryPatterns, ...(layout.entryPoints ?? [])].map((glob) =>
    toPosix(path.join(projectRoot, glob)),
  );
  const globs = [...configured, ...manifestGlobs.map(toPosix)];
  const rules = walkRules({ projectRoot, layout });
  return filesMatching(filesNear(globs, { layout, walk, rules, projectRoot }), globs);
}

export function publicFilesOf({
  files,
  projectRoot,
  packagesInfo,
  layout,
}: {
  files: readonly string[];
  projectRoot: string;
  packagesInfo: PackagesInfo;
  layout: ReexportLayout;
}): string[] {
  const manifestGlobs = packagesInfo.packages
    .filter(({ published }) => published)
    .flatMap((entry) => publicEntryGlobs(entry, layout));
  const configured = (layout.entryPoints ?? []).map((glob) => path.join(projectRoot, glob));
  return filesMatching(files, [...configured, ...manifestGlobs].map(toPosix));
}

function usesOf(module: ResolvedModule): Reference[] {
  return [
    ...module.references,
    ...module.edges.map((edge) => ({
      source: edge.source,
      imported: edge.star ? NAMED_EXPORTS : edge.imported,
    })),
  ];
}

function touchesFile(used: ReadonlySet<string>, file: string): boolean {
  return [...used].some((key) => key.startsWith(`${file}\0`));
}

function isTested(used: ReadonlySet<string>, node: GraphNode): boolean {
  return isWildcard(node.name) ? touchesFile(used, node.file) : isCovered(used, node);
}

function isHostListed({ hostFile, hostName }: Chain, listed: ReadonlySet<string>): boolean {
  return hostName === undefined || listed.has(slotOf(hostFile, hostName));
}

function candidatesOf(chain: Chain, { revealed, listed }: Known): Candidate[] {
  const { node } = chain;
  if (isWildcard(node.name)) {
    return [...revealed.values()]
      .filter(
        ({ file, name }) =>
          file === node.file && !(node.name === NAMED_EXPORTS && name === 'default'),
      )
      .map((entry) => ({ ...entry, chain }));
  }
  const entry = revealed.get(slotOf(node.file, node.name));
  if (entry !== undefined) {
    return [{ ...entry, chain }];
  }
  const isMasked = node.viaImport && !listed.has(slotOf(node.file, node.name));
  return isMasked ? [{ file: node.file, name: node.name, chain }] : [];
}

function isInsideOnePackage(
  group: Group,
  { projectRoot, packagesInfo }: { projectRoot: string; packagesInfo: PackagesInfo },
): boolean {
  const { file } = group[0];
  return (
    !path.relative(projectRoot, file).startsWith('..') &&
    group.every(
      ({ chain }) => packagesInfo.packageOf(chain.hostFile) === packagesInfo.packageOf(file),
    )
  );
}

function reportedItem(group: Group, projectRoot: string): KnipItem {
  const { file, name, item } = group[0];
  const relative = path.relative(projectRoot, file);
  const hosts = group.map(({ chain }) => path.relative(projectRoot, chain.hostFile)).toSorted();
  const declared = {
    file: relative,
    category: 'exports' as const,
    entry: { name, line: exportLineOf(file, name) },
  };
  return { ...(item ?? declared), reexportedBy: hosts[0] };
}

function revealedEntries({ production, entryExportsRun, projectRoot }: Options): Known {
  const known = new Set(entriesOf(production).map(keyOf));
  const items = entriesOf(entryExportsRun())
    .filter(({ category }) => category !== 'files')
    .map((item) => ({
      item,
      file: toPosix(path.join(projectRoot, item.file)),
      name: item.entry.name,
    }));
  return {
    listed: new Set(items.map(({ file, name }) => slotOf(file, name))),
    revealed: new Map(
      items
        .filter(({ item }) => !known.has(keyOf(item)))
        .map((entry) => [slotOf(entry.file, entry.name), entry]),
    ),
  };
}

function projectOf(
  { layout, projectRoot }: Options,
  walk: Walk,
): { files: string[]; productionFiles: string[]; supportFiles: string[] } {
  const files = walk([projectRoot], layout, projectRoot).map(toPosix);
  const isProduction = layoutProductionMatcher(layout);
  const production = new Set(
    files.filter((file) => isProduction(path.relative(projectRoot, file))),
  );
  return {
    files,
    productionFiles: [...production],
    supportFiles: files.filter((file) => !production.has(file)),
  };
}

function needsProductionCheck(group: Group): boolean {
  return group[0].item === undefined || group.some(({ chain }) => chain.node.name === EVERYTHING);
}

function survivors(
  groups: readonly Group[],
  {
    project,
    graph,
    moduleOf,
    testUsed,
    known,
    options,
  }: {
    project: Project;
    graph: Graph;
    moduleOf: ModuleOf;
    testUsed: ReadonlySet<string>;
    known: Known;
    options: Options;
  },
): Group[] {
  const { files, productionFiles } = project;
  const { projectRoot, packagesInfo } = options;
  const surface = graph.surfaceOf(publicFilesOf({ files, ...options }));
  const productionUsed = lazily(() =>
    graph.usedBy(productionFiles.flatMap((file) => moduleOf(file).references)),
  );
  return groups
    .filter((group) => group.every(({ chain }) => isHostListed(chain, known.listed)))
    .filter((group) => isInsideOnePackage(group, { projectRoot, packagesInfo }))
    .filter((group) => !isCovered(surface, group[0]))
    .filter((group) => isCovered(testUsed, group[0]))
    .filter((group) => !needsProductionCheck(group) || !isCovered(productionUsed(), group[0]));
}

export function reexportedTestOnlyEntries(options: Options): KnipItem[] {
  const walk = options.walk ?? codeFilesUnder;
  const moduleOf = projectModules(options);
  const graph = reexportGraph(moduleOf);
  const reexports = entryFilesOf(options, walk).flatMap((file) => graph.chainsOf(file));
  if (reexports.length === 0) {
    return [];
  }
  const project = projectOf(options, walk);
  const testUsed = graph.usedBy(project.supportFiles.flatMap((file) => usesOf(moduleOf(file))));
  const chains = reexports.filter(({ node }) => isTested(testUsed, node));
  if (chains.length === 0) {
    return [];
  }
  const known = revealedEntries(options);
  const groups = Map.groupBy(
    chains.flatMap((chain) => candidatesOf(chain, known)),
    ({ file, name }) => slotOf(file, name),
  );
  const context = { project, graph, moduleOf, testUsed, known, options };
  return survivors([...groups.values()].filter(isNonEmpty), context).map((group) =>
    reportedItem(group, options.projectRoot),
  );
}
