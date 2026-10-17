import path from 'node:path';
import { globToRegExp, toPosix } from '../../layout.mjs';
import { codeFilesUnder, walkRules } from '../program.mjs';
import { publicEntryGlobs } from '../workspace/entries.mjs';
import { entriesOf, keyOf } from './knip-report.mjs';
import { layoutProductionMatcher } from './production-config.mjs';
import { exportLineOf, lazily, projectModules } from './project-modules.mjs';
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

function staticBase(glob) {
  const segments = glob.split('/');
  const dynamic = segments.findIndex((segment) => /[*?{]/u.test(segment));
  return dynamic === -1
    ? { path: glob, isFile: true }
    : { path: segments.slice(0, dynamic).join('/'), isFile: false };
}

function filesNear(globs, { layout, walk, rules, projectRoot }) {
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

function entryFilesOf({ projectRoot, entryPatterns, packagesInfo, layout }, walk) {
  const manifestGlobs = packagesInfo.packages.flatMap((entry) => publicEntryGlobs(entry, layout));
  const configured = [...entryPatterns, ...(layout.entryPoints ?? [])].map((glob) =>
    toPosix(path.join(projectRoot, glob)),
  );
  const globs = [...configured, ...manifestGlobs.map(toPosix)];
  const rules = walkRules({ projectRoot, layout });
  return filesMatching(filesNear(globs, { layout, walk, rules, projectRoot }), globs);
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
  if (entry !== undefined) {
    return [{ ...entry, chain }];
  }
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
  const declared = {
    file: relative,
    category: 'exports',
    entry: { name, line: exportLineOf(file, name) },
  };
  return { ...(item ?? declared), reexportedBy: hosts[0] };
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

function projectOf({ layout, projectRoot }, walk) {
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

function needsProductionCheck(group) {
  return group[0].item === undefined || group.some(({ chain }) => chain.node.name === EVERYTHING);
}

function survivors(groups, { project, graph, moduleOf, testUsed, known, options }) {
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

export function reexportedTestOnlyEntries(options) {
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
  return survivors([...groups.values()], context).map((group) =>
    reportedItem(group, options.projectRoot),
  );
}
