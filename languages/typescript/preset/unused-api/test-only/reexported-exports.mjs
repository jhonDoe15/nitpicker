import path from 'node:path';
import { globToRegExp, toPosix } from '../../layout.mjs';
import { codeFilesUnder } from '../program.mjs';
import { publicEntryGlobs } from '../workspace/entries.mjs';
import { entriesOf, keyOf } from './knip-report.mjs';
import { layoutProductionMatcher } from './production-config.mjs';
import { projectModules } from './project-modules.mjs';
import { EVERYTHING, NAMED_EXPORTS, isCovered, reexportGraph } from './reexport-graph.mjs';

function filesMatching(files, globs) {
  const matchers = globs.filter((glob) => !glob.startsWith('!')).map((glob) => globToRegExp(glob));
  return files.filter((file) => matchers.some((matcher) => matcher.test(file)));
}

function slotOf(file, name) {
  return `${file}\0${name}`;
}

function isWildcard(name) {
  return name === EVERYTHING || name === NAMED_EXPORTS;
}

function entryFilesOf({ files, projectRoot, entryPatterns, packagesInfo, layout }) {
  const manifestGlobs = packagesInfo.packages.flatMap((entry) => publicEntryGlobs(entry, layout));
  const configured = [...entryPatterns, ...(layout.entryPoints ?? [])].map((glob) =>
    toPosix(path.join(projectRoot, glob)),
  );
  return filesMatching(files, [...configured, ...manifestGlobs.map(toPosix)]);
}

function publicFilesOf({ files, projectRoot, packagesInfo, layout }) {
  const manifestGlobs = packagesInfo.packages
    .filter(({ published }) => published)
    .flatMap((entry) => publicEntryGlobs(entry, layout));
  const configured = (layout.entryPoints ?? []).map((glob) => path.join(projectRoot, glob));
  return filesMatching(files, [...configured, ...manifestGlobs].map(toPosix));
}

function usesOf(module) {
  return [
    ...module.references,
    ...module.edges.map((edge) => ({
      source: edge.source,
      imported: edge.star ? NAMED_EXPORTS : edge.imported,
    })),
  ];
}

function touchesFile(used, file) {
  return [...used].some((key) => key.startsWith(`${file}\0`));
}

function isTested(used, node) {
  return isWildcard(node.name) ? touchesFile(used, node.file) : isCovered(used, node);
}

function isHostListed({ hostFile, hostName }, listed) {
  return hostName === undefined || listed.has(slotOf(hostFile, hostName));
}

function lazily(compute) {
  let value;
  return () => (value ??= compute());
}

function candidatesOf(chain, { revealed, listed }) {
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
  if (entry !== undefined) return [{ ...entry, chain }];
  const isMasked = node.viaImport && !listed.has(slotOf(node.file, node.name));
  return isMasked ? [{ file: node.file, name: node.name, chain }] : [];
}

function isInsideOnePackage(group, { projectRoot, packagesInfo }) {
  const { file } = group[0];
  return (
    !path.relative(projectRoot, file).startsWith('..') &&
    group.every(
      ({ chain }) => packagesInfo.packageOf(chain.hostFile) === packagesInfo.packageOf(file),
    )
  );
}

function reportedItem(group, projectRoot) {
  const { file, name, item } = group[0];
  const relative = path.relative(projectRoot, file);
  const hosts = group.map(({ chain }) => path.relative(projectRoot, chain.hostFile)).toSorted();
  return {
    ...(item ?? { file: relative, category: 'exports', entry: { name } }),
    reexportedBy: hosts[0],
  };
}

function revealedEntries({ production, entryExportsRun, projectRoot }) {
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

function projectOf({ layout, projectRoot, packagesInfo }) {
  const moduleOf = projectModules({ projectRoot, layout, packagesInfo });
  const files = codeFilesUnder([projectRoot], layout).map(toPosix);
  const isProduction = layoutProductionMatcher(layout);
  const productionFiles = files.filter((file) => isProduction(path.relative(projectRoot, file)));
  return {
    moduleOf,
    graph: reexportGraph(moduleOf),
    files,
    productionFiles,
    supportFiles: files.filter((file) => !productionFiles.includes(file)),
  };
}

function testedChains(project, options) {
  const { graph, moduleOf, files, supportFiles } = project;
  const chains = entryFilesOf({ files, ...options }).flatMap((file) => graph.chainsOf(file));
  if (chains.length === 0) return { chains, testUsed: new Set() };
  const testUsed = graph.usedBy(supportFiles.flatMap((file) => usesOf(moduleOf(file))));
  return { testUsed, chains: chains.filter(({ node }) => isTested(testUsed, node)) };
}

function survivors(groups, { project, testUsed, known, options }) {
  const { graph, moduleOf, files, productionFiles } = project;
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
    .filter((group) => group[0].item !== undefined || !isCovered(productionUsed(), group[0]));
}

export function reexportedTestOnlyEntries(options) {
  const project = projectOf(options);
  const { chains, testUsed } = testedChains(project, options);
  if (chains.length === 0) return [];
  const known = revealedEntries(options);
  const groups = Map.groupBy(
    chains.flatMap((chain) => candidatesOf(chain, known)),
    ({ file, name }) => slotOf(file, name),
  );
  return survivors([...groups.values()], { project, testUsed, known, options }).map((group) =>
    reportedItem(group, options.projectRoot),
  );
}
