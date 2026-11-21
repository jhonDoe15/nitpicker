import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveInside } from '../../../../shared/conventions/read-inside.mts';

type ConfigSource = { readonly file: string; readonly moduleDir: string };
type GeneratorTarget = { readonly targetProject: string; readonly packagePath: string };
type ResolvedCandidate = {
  readonly base: string;
  readonly projectDir: string;
  readonly fullDir: string;
  readonly prefix: string;
};

const SKIPPED_DIRS = new Set(['.git', 'build', 'target', 'node_modules']);
const MODULE_MARKERS = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
const GENERATOR_CONFIG_NAME = /^generatorConfig[^/]*\.xml$/u;
const XML_COMMENT = /<!--[\s\S]*?-->/gu;
const PLUGIN_BLOCK = /<plugin\b[^>]*>([\s\S]*?)<\/plugin>/gu;
const MYBATIS_PLUGIN = /\bmybatis-generator-maven-plugin\b/u;
const CONFIGURATION_FILE_TAG = /<configurationFile>\s*([^<]+?)\s*<\/configurationFile>/gu;
const GENERATOR_TAG = /<java(?:Model|Client)Generator\b([^>]*)>/gu;
const TARGET_PACKAGE_ATTR = /\btargetPackage\s*=\s*(?:"([^"]*)"|'([^']*)')/u;
const TARGET_PROJECT_ATTR = /\btargetProject\s*=\s*(?:"([^"]*)"|'([^']*)')/u;
const BASEDIR_PREFIX = /^\$\{(?:project\.)?basedir\}(?:[\\/]+|$)/u;
const MAX_CACHE_ENTRIES = 64;

function isDirectory(target: string): boolean {
  return statSync(target, { throwIfNoEntry: false })?.isDirectory() === true;
}

function readXmlWithoutComments(file: string): string | undefined {
  const stats = statSync(file, { throwIfNoEntry: false });
  return stats?.isFile() === true ? readFileSync(file, 'utf8').replace(XML_COMMENT, '') : undefined;
}

function normalizePosix(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '');
}

function resolveWithin(
  resolvedRoot: string,
  baseDir: string,
  relativePath: string,
): string | undefined {
  const fromRoot = path.relative(resolvedRoot, path.resolve(baseDir, relativePath));
  return fromRoot === '' ? undefined : resolveInside(resolvedRoot, fromRoot);
}

function isWithinOrEqual(resolvedRoot: string, target: string): boolean {
  return target === resolvedRoot || target.startsWith(resolvedRoot + path.sep);
}

function cleanTargetProject(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return undefined;
  }
  const withoutBasedir = trimmed.replace(BASEDIR_PREFIX, '');
  if (withoutBasedir.includes('${')) {
    return undefined;
  }
  const normalized = normalizePosix(withoutBasedir);
  return normalized === '' ? '.' : normalized;
}

function packageSubpath(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.includes('${') || /[/\\]/u.test(trimmed)) {
    return undefined;
  }
  const segments = trimmed.split('.');
  return segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ? undefined
    : segments.join('/');
}

function attributeValue(attributes: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(attributes);
  return match === null ? undefined : (match[1] ?? match[2]);
}

function parseGeneratorTargets(strippedXml: string): GeneratorTarget[] {
  const targets: GeneratorTarget[] = [];
  for (const match of strippedXml.matchAll(GENERATOR_TAG)) {
    const attributes = match[1] ?? '';
    const rawProject = attributeValue(attributes, TARGET_PROJECT_ATTR);
    const rawPackage = attributeValue(attributes, TARGET_PACKAGE_ATTR);
    const targetProject = rawProject === undefined ? undefined : cleanTargetProject(rawProject);
    const packagePath = rawPackage === undefined ? undefined : packageSubpath(rawPackage);
    if (targetProject !== undefined && packagePath !== undefined) {
      targets.push({ targetProject, packagePath });
    }
  }
  return targets;
}

function ancestorModuleDir(startDir: string, resolvedRoot: string): string {
  let current = startDir;
  while (isWithinOrEqual(resolvedRoot, current)) {
    if (MODULE_MARKERS.some((marker) => existsSync(path.join(current, marker)))) {
      return current;
    }
    const parent = path.dirname(current);
    if (current === resolvedRoot || parent === current) {
      break;
    }
    current = parent;
  }
  return startDir;
}

function pluginConfigSources(block: string, pomDir: string, resolvedRoot: string): ConfigSource[] {
  if (!MYBATIS_PLUGIN.test(block)) {
    return [];
  }
  const sources: ConfigSource[] = [];
  for (const configMatch of block.matchAll(CONFIGURATION_FILE_TAG)) {
    const cleaned = cleanTargetProject(configMatch[1] ?? '');
    const resolved =
      cleaned === undefined || cleaned === '.'
        ? undefined
        : resolveWithin(resolvedRoot, pomDir, cleaned);
    if (resolved !== undefined) {
      sources.push({ file: resolved, moduleDir: pomDir });
    }
  }
  return sources;
}

function pomConfigSources(pomFile: string, resolvedRoot: string): ConfigSource[] {
  const stripped = readXmlWithoutComments(pomFile);
  if (stripped === undefined || !MYBATIS_PLUGIN.test(stripped)) {
    return [];
  }
  const pomDir = path.dirname(pomFile);
  return [...stripped.matchAll(PLUGIN_BLOCK)].flatMap((match) =>
    pluginConfigSources(match[1] ?? '', pomDir, resolvedRoot),
  );
}

function fileConfigSources(
  current: string,
  name: string,
  resolvedRoot: string,
): readonly ConfigSource[] {
  const fullPath = path.join(current, name);
  if (GENERATOR_CONFIG_NAME.test(name)) {
    return [{ file: fullPath, moduleDir: ancestorModuleDir(current, resolvedRoot) }];
  }
  return name === 'pom.xml' ? pomConfigSources(fullPath, resolvedRoot) : [];
}

function scanDirectory(current: string, resolvedRoot: string, pending: string[]): ConfigSource[] {
  const found: ConfigSource[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) {
      pending.push(path.join(current, entry.name));
    } else if (entry.isFile()) {
      found.push(...fileConfigSources(current, entry.name, resolvedRoot));
    }
  }
  return found;
}

function scanConfigSources(resolvedRoot: string): ConfigSource[] {
  if (!isDirectory(resolvedRoot)) {
    return [];
  }
  const sources: ConfigSource[] = [];
  const pending = [resolvedRoot];
  for (const current of pending) {
    sources.push(...scanDirectory(current, resolvedRoot, pending));
  }
  return sources;
}

function candidateFor(
  resolvedRoot: string,
  base: string,
  target: GeneratorTarget,
): ResolvedCandidate | undefined {
  const projectDir = path.resolve(base, target.targetProject);
  if (!isWithinOrEqual(resolvedRoot, projectDir)) {
    return undefined;
  }
  const fullDir = resolveWithin(resolvedRoot, projectDir, target.packagePath);
  if (fullDir === undefined) {
    return undefined;
  }
  const relative = path.relative(resolvedRoot, fullDir).replaceAll('\\', '/');
  return { base, projectDir, fullDir, prefix: relative.endsWith('/') ? relative : `${relative}/` };
}

type TargetContext = {
  readonly resolvedRoot: string;
  readonly source: ConfigSource;
  readonly target: GeneratorTarget;
};

function chooseCandidates(
  { resolvedRoot, source, target }: TargetContext,
  candidates: readonly ResolvedCandidate[],
): string[] {
  const existingPackages = candidates.filter((candidate) => isDirectory(candidate.fullDir));
  if (existingPackages.length > 0) {
    return existingPackages.map((candidate) => candidate.prefix);
  }
  const existingProjects = candidates.filter((candidate) => isDirectory(candidate.projectDir));
  if (existingProjects.length > 0) {
    return existingProjects.map((candidate) => candidate.prefix);
  }
  const modulePrefix = path.relative(resolvedRoot, source.moduleDir).replaceAll('\\', '/');
  const fromRoot =
    modulePrefix !== '' &&
    (target.targetProject === modulePrefix || target.targetProject.startsWith(`${modulePrefix}/`));
  const preferredBase = fromRoot ? resolvedRoot : source.moduleDir;
  const preferred =
    candidates.find((candidate) => candidate.base === preferredBase) ?? candidates[0];
  return preferred === undefined ? [] : [preferred.prefix];
}

function resolveTargetDirectories(context: TargetContext): string[] {
  const { resolvedRoot, source, target } = context;
  const candidates = [...new Set([source.moduleDir, resolvedRoot])]
    .map((base) => candidateFor(resolvedRoot, base, target))
    .filter((candidate): candidate is ResolvedCandidate => candidate !== undefined);
  return chooseCandidates(context, candidates);
}

function prefixesForSource(resolvedRoot: string, source: ConfigSource): string[] {
  const stripped = readXmlWithoutComments(source.file);
  if (stripped === undefined) {
    return [];
  }
  return parseGeneratorTargets(stripped).flatMap((target) =>
    resolveTargetDirectories({ resolvedRoot, source, target }),
  );
}

function discoverGeneratedDirectories(resolvedRoot: string): readonly string[] {
  const prefixes = new Set<string>(
    scanConfigSources(resolvedRoot).flatMap((source) => prefixesForSource(resolvedRoot, source)),
  );
  return [...prefixes].toSorted();
}

function memoizedDirectories(): (projectRoot: string) => readonly string[] {
  const cache = new Map<string, readonly string[]>();
  return (projectRoot: string): readonly string[] => {
    const resolvedRoot = path.resolve(projectRoot);
    const cached = cache.get(resolvedRoot);
    if (cached !== undefined) {
      return cached;
    }
    const discovered = discoverGeneratedDirectories(resolvedRoot);
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        cache.delete(oldest);
      }
    }
    cache.set(resolvedRoot, discovered);
    return discovered;
  };
}

export const configuredGeneratedDirectories: (projectRoot: string) => readonly string[] =
  memoizedDirectories();

export function isConfiguredGenerated(
  projectRoot: string,
  file: string,
  directories?: readonly string[],
): boolean {
  const prefixes = directories ?? configuredGeneratedDirectories(projectRoot);
  if (prefixes.length === 0) {
    return false;
  }
  const normalized = normalizePosix(file);
  return prefixes.some((prefix) => normalized.startsWith(prefix));
}
