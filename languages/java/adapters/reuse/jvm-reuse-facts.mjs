import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../../shared/paths/glob.mjs';
import { baselinePathsOf } from '../../../../shared/rules/facts/baseline.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { pathInside, sourceFilesUnder } from '../review-rules/java-sources.mjs';
import { definitionKey, fileBindings, importFacts, projectIndex } from './jvm-references.mjs';
import { readJvmDefinitions } from './source/jvm-definitions.mjs';

const REUSE_TOOL = 'structure';
const REUSE_RULES = ['duplicate-definition', 'exported-name-collision', 'sibling-copy-edit'];
const OUTSIDE_SOURCES = /^(?:\.\.(?:\/|$))|(?:^|\/)build(?:\/|$)/u;
const JAVA_COLLISION_FIX = 'Rename one, or use both by their fully qualified names.';
const UNKNOWN_BASE = { unchanged: false, definitions: [] };

function sourceRootsOf(project, kotlin) {
  return [
    ...(project.sourceRoots ?? []),
    ...(kotlin ? (project.kotlinSourceRoots ?? []) : []),
  ].filter((root) => root !== '' && !OUTSIDE_SOURCES.test(root));
}

function projectSources(projectRoot, { project, kotlin }) {
  const extensions = kotlin ? ['.java', '.kt'] : ['.java'];
  return [...new Set(sourceRootsOf(project, kotlin))]
    .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), extensions))
    .map((full) => [path.relative(projectRoot, full).replaceAll('\\', '/'), project]);
}

function sourceFiles(projectRoot, { projects, kotlin, exclude = [] }) {
  const excluded = exclude.map((glob) => globMatcher(glob));
  const found = projects
    .flatMap((project) => projectSources(projectRoot, { project, kotlin }))
    .filter(([file]) => !excluded.some((matcher) => matcher.test(file)));
  return new Map(found.toReversed());
}

function parse(text, file) {
  return readJvmDefinitions(text, { kotlin: file.endsWith('.kt') });
}

function isPublished(project) {
  if (project.reportRoot === undefined) {
    return false;
  }
  const manifest = pathInside(project.reportRoot, 'manifest.json');
  return existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).published === true;
}

function neutralDefinition(file, definition, context) {
  const { start, end, owner, ...rest } = definition;
  return { file, ...rest, key: definitionKey(definition, context) };
}

export function jvmReuseFacts(projectRoot, { projects, kotlin = false, exclude }) {
  const owners = sourceFiles(projectRoot, { projects, kotlin, exclude });
  const files = [...owners].map(([file, project]) => ({
    file,
    module: project.qualifier ?? '',
    parsed: parse(readFileSync(pathInside(projectRoot, file), 'utf8'), file),
  }));
  const index = projectIndex(files);
  const bound = files.map((entry) => ({ ...entry, bindings: fileBindings(index, entry) }));
  return {
    modules: bound.map(({ file, parsed }) => ({
      file,
      role: 'production',
      ...(parsed.definitions.some(({ entry }) => entry === true) ? { entry: true } : {}),
    })),
    packages: projects.map((project) => ({
      root: project.qualifier ?? '',
      published: isPublished(project),
    })),
    definitions: bound.flatMap((entry) =>
      entry.parsed.definitions.map((definition) =>
        neutralDefinition(entry.file, definition, entry),
      ),
    ),
    imports: bound.flatMap((entry) => importFacts(index, entry)),
  };
}

function baselineReader(projectRoot, { baselineRoot, baselineMovesFile }) {
  const basePaths = baselinePathsOf({ snapshot: 'head', baselineMovesFile });
  return (file) => {
    const baseFile = pathInside(baselineRoot, basePaths.get(file) ?? file);
    if (!existsSync(baseFile)) {
      return UNKNOWN_BASE;
    }
    const before = readFileSync(baseFile, 'utf8');
    if (before === readFileSync(pathInside(projectRoot, file), 'utf8')) {
      return { unchanged: true, definitions: [] };
    }
    return {
      unchanged: false,
      definitions: parse(before, file).definitions.map(
        ({ kind, name, qualifier, tokens, text }) => ({
          kind,
          name,
          qualifier,
          tokens,
          text,
        }),
      ),
    };
  };
}

function baselineOf(projectRoot, policy) {
  const onHead = policy.baseline?.snapshot === 'head' && policy.baselineRoot !== undefined;
  return onHead ? { readFile: baselineReader(projectRoot, policy) } : undefined;
}

export function readJvmReuseFindings(projectRoot, { projects, kotlin = false, policy = {} }) {
  const facts = jvmReuseFacts(projectRoot, { projects, kotlin, exclude: policy.exclude });
  return sharedFactFindings(facts, {
    language: kotlin ? 'kotlin' : 'java',
    analyzerName: REUSE_TOOL,
    rules: REUSE_RULES,
    policy: { exceptions: policy.exceptions ?? [] },
    baseline: baselineOf(projectRoot, policy),
    collisionFixFor: (importer) => (importer.endsWith('.java') ? JAVA_COLLISION_FIX : undefined),
  });
}
