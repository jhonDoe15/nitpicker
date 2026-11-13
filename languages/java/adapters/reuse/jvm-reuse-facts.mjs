import { existsSync, readFileSync } from 'node:fs';
import { baselinePathsOf } from '../../../../shared/rules/facts/baseline.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { pathInside, projectSourceFiles } from '../review-rules/java-sources.mjs';
import { readJvmUnits } from '../near-duplicates/jvm-trees.mjs';
import { definitionKey } from './jvm-definition-keys.mjs';
import { fileBindings, importFacts, projectIndex, referenceScope } from './jvm-references.mjs';
import { readJvmDefinitions } from './source/jvm-definitions.mjs';
import {
  aliasEntryFields,
  kotlinEntryPointFindings,
  typeAliasReexports,
} from './kotlin-type-aliases.mjs';

const REUSE_TOOL = 'structure';
const COUPLING_TOOL = 'coupling';
const SHARED_USAGE_RULES = ['shared-used-by-one-feature'];
const REUSE_RULES = [
  'duplicate-definition',
  'exported-name-collision',
  'sibling-copy-edit',
  'near-duplicate',
  'decided-condition',
];
const JAVA_COLLISION_FIX = 'Rename one, or use both by their fully qualified names.';
const UNKNOWN_BASE = { unchanged: false, definitions: [] };

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
  const { start, end, owner, supertypes, ...rest } = definition;
  return { file, ...rest, key: definitionKey(definition, context) };
}

export function jvmReuseFacts(projectRoot, { projects, kotlin = false, exclude }) {
  const owners = projectSourceFiles(projectRoot, { projects, kotlin, exclude });
  const files = [...owners].map(([file, project]) => ({
    file,
    module: project.qualifier ?? '',
    parsed: parse(readFileSync(pathInside(projectRoot, file), 'utf8'), file),
  }));
  const index = projectIndex(files);
  const bound = files.map((entry) => ({
    ...entry,
    bindings: fileBindings(index, entry),
    scope: referenceScope(index, entry),
  }));
  const aliases = bound.flatMap((entry) => typeAliasReexports(index, entry));
  return {
    modules: bound.map((entry) => ({
      file: entry.file,
      role: 'production',
      ...(entry.parsed.definitions.some(({ entry: isEntry }) => isEntry === true)
        ? { entry: true }
        : {}),
      ...aliasEntryFields(entry, aliases),
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
    imports: [...bound.flatMap((entry) => importFacts(index, entry)), ...aliases],
    nearDuplicateUnits: unitFacts(projectRoot, files),
  };
}

function unitFacts(projectRoot, files) {
  const sources = files.map(({ file }) => file).filter((file) => /\.(?:java|kt)$/u.test(file));
  return readJvmUnits(projectRoot, sources).map(
    ({ file, name, start, end, tokens, final, tree }) => ({
      file,
      name,
      start,
      end,
      tokens,
      final,
      tree,
    }),
  );
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

export function readJvmReuseFindings(projectRoot, options) {
  return readJvmReuse(projectRoot, options).findings;
}

export function readJvmReuse(projectRoot, { projects, kotlin = false, policy = {} }) {
  const facts = jvmReuseFacts(projectRoot, { projects, kotlin, exclude: policy.exclude });
  const language = kotlin ? 'kotlin' : 'java';
  const exceptions = policy.exceptions ?? [];
  const findings = [
    ...sharedFactFindings(facts, {
      language,
      analyzerName: REUSE_TOOL,
      rules: REUSE_RULES,
      policy: { exceptions },
      baseline: baselineOf(projectRoot, policy),
      collisionFixFor: (importer) => (importer.endsWith('.java') ? JAVA_COLLISION_FIX : undefined),
    }),
    ...sharedFactFindings(facts, {
      language,
      analyzerName: COUPLING_TOOL,
      rules: SHARED_USAGE_RULES,
      policy: { exceptions, ...(policy.layout === undefined ? {} : { layout: policy.layout }) },
    }),
    ...(kotlin ? kotlinEntryPointFindings(facts, exceptions) : []),
  ];
  return { findings, imports: facts.imports };
}
