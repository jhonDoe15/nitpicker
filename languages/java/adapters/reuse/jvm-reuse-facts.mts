import { existsSync, readFileSync } from 'node:fs';
import {
  fieldOf,
  optionalText,
  parseJson,
  textOf,
  textsOf,
} from '../../../../shared/values/readers.mts';
import {
  callUntyped,
  findingsOf,
  type JavaFinding,
  type JavaPolicy,
} from '../typed/java-values.mts';
import { baselinePathsOf as untypedBaselinePathsOf } from '../../../../shared/rules/facts/baseline.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import {
  pathInside as untypedPathInside,
  projectSourceFiles as untypedProjectSourceFiles,
} from '../review-rules/java-sources.mts';
import { readJvmUnits as untypedReadJvmUnits } from '../near-duplicates/jvm-trees.mts';
import { toolSlots } from '../../maven/parallel/tool-slots.mts';
import { definitionKey } from './jvm-definition-keys.mts';
import { importFacts } from './jvm-reference-uses.mts';
import { fileBindings, projectIndex, referenceScope } from './jvm-references.mts';
import { readJvmDefinitions } from './source/jvm-definitions.mts';
import {
  type BoundEntry,
  type Definition,
  type Entry,
  type Parsed,
  type ReuseFacts,
  type ReusePart,
} from './jvm-reuse-types.mts';
import {
  aliasEntryFields,
  kotlinEntryPointFindings,
  typeAliasReexports,
} from './kotlin-type-aliases.mts';

type Project = {
  readonly qualifier?: string | undefined;
  readonly reportRoot?: string | undefined;
};
type ReuseOptions = {
  readonly projects: readonly Project[];
  readonly kotlin?: true | false;
  readonly policy?: JavaPolicy;
  readonly decisionWorkers?: number;
};
type BaselineEntry = {
  readonly unchanged: boolean;
  readonly definitions: readonly Pick<
    Definition,
    'kind' | 'name' | 'qualifier' | 'tokens' | 'text'
  >[];
};
type BaselinePolicy = {
  readonly baselineRoot: string;
  readonly baselineMovesFile?: unknown;
};

const baselinePathsOf: (options: {
  snapshot: string;
  baselineMovesFile: unknown;
}) => Map<string, string> = untypedBaselinePathsOf;
const pathInside: (root: string, file: string) => string = untypedPathInside;
const readJvmUnits: (
  projectRoot: string,
  files: readonly string[],
) => Readonly<Record<string, unknown>>[] = untypedReadJvmUnits;

const REUSE_TOOL = 'structure';
const COUPLING_TOOL = 'coupling';
const SHARED_USAGE_RULES = ['shared-used-by-one-feature'];
const REUSE_RULES = [
  'duplicate-definition',
  'exported-name-collision',
  'sibling-copy-edit',
  'near-duplicate',
  'decided-condition',
  'duplicate-branch',
  'result-slip',
  'integer-slip',
  'shorter-condition',
];
const JAVA_COLLISION_FIX = 'Rename one, or use both by their fully qualified names.';
const UNKNOWN_BASE = { unchanged: false, definitions: [] };

function projectOf(value: unknown): Project {
  return {
    qualifier: optionalText(fieldOf(value, 'qualifier')),
    reportRoot: optionalText(fieldOf(value, 'reportRoot')),
  };
}

function projectSourceFiles(
  projectRoot: string,
  options: {
    projects: readonly Project[];
    kotlin: boolean;
    exclude: readonly string[] | undefined;
  },
): Map<string, Project> {
  const found: unknown = callUntyped(untypedProjectSourceFiles, projectRoot, options);
  return new Map(
    found instanceof Map
      ? Array.from(found.entries(), (entry): [string, Project] => [
          textOf(entry[0]),
          projectOf(entry[1]),
        ])
      : [],
  );
}

function parse(text: string, file: string): Parsed {
  return readJvmDefinitions(text, { kotlin: file.endsWith('.kt') });
}

export function publishedOf(reportRoot: string | undefined): boolean {
  if (reportRoot === undefined) {
    return false;
  }
  const manifest = pathInside(reportRoot, 'manifest.json');
  return (
    existsSync(manifest) && fieldOf(parseJson(readFileSync(manifest, 'utf8')), 'published') === true
  );
}

function isPublished(project: Project): boolean {
  const published = fieldOf(project, 'published');
  return typeof published === 'boolean' ? published : publishedOf(project.reportRoot);
}

function neutralDefinition(
  file: string,
  definition: Definition,
  context: BoundEntry,
): { file: string; key: string; [field: string]: unknown } {
  const { start, end, owner, supertypes, ...rest } = definition;
  return { file, ...rest, key: definitionKey(definition, context) };
}

export function jvmReuseFacts(
  projectRoot: string,
  {
    projects,
    kotlin = false,
    exclude,
  }: { projects: readonly Project[]; kotlin?: true | false; exclude?: readonly string[] },
): ReuseFacts {
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

function unitFacts(projectRoot: string, files: readonly Entry[]) {
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

function baselineReader(
  projectRoot: string,
  { baselineRoot, baselineMovesFile }: BaselinePolicy,
): (file: string) => BaselineEntry {
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

function baselineOf(
  projectRoot: string,
  policy: JavaPolicy,
): { readFile: (file: string) => BaselineEntry } | undefined {
  const { baselineRoot } = policy;
  const onHead = fieldOf(policy['baseline'], 'snapshot') === 'head' && baselineRoot !== undefined;
  return onHead
    ? {
        readFile: baselineReader(projectRoot, {
          baselineRoot,
          baselineMovesFile: policy.baselineMovesFile,
        }),
      }
    : undefined;
}

export function readJvmReuseFindings(projectRoot: string, options: ReuseOptions): JavaFinding[] {
  return readJvmReuse(projectRoot, options).findings;
}

export function readReusePart(
  projectRoot: string,
  { projects, kotlin = false, policy = {}, decisionWorkers = toolSlots() }: ReuseOptions,
): ReusePart {
  const facts = jvmReuseFacts(projectRoot, { projects, kotlin, exclude: textsOf(policy.exclude) });
  const exceptions = policy.exceptions ?? [];
  return {
    findings: findingsOf(
      callUntyped(sharedFactFindings, facts, {
        language: kotlin ? 'kotlin' : 'java',
        analyzerName: REUSE_TOOL,
        rules: REUSE_RULES,
        policy: { exceptions },
        baseline: baselineOf(projectRoot, policy),
        collisionFixFor: (importer: string) =>
          importer.endsWith('.java') ? JAVA_COLLISION_FIX : undefined,
        decisionWorkers,
      }),
    ),
    entryFindings: kotlin ? kotlinEntryPointFindings(facts, exceptions) : [],
    usage: { modules: facts.modules, packages: facts.packages, imports: facts.imports },
  };
}

export function withSharedUsage(
  { findings, entryFindings, usage }: ReusePart,
  { kotlin = false, policy = {} }: Omit<ReuseOptions, 'projects'>,
): { findings: JavaFinding[]; imports: unknown } {
  const layout = policy.layout === undefined ? {} : { layout: policy.layout };
  const shared = findingsOf(
    callUntyped(sharedFactFindings, usage, {
      language: kotlin ? 'kotlin' : 'java',
      analyzerName: COUPLING_TOOL,
      rules: SHARED_USAGE_RULES,
      policy: { exceptions: policy.exceptions ?? [], ...layout },
    }),
  );
  return { findings: [...findings, ...shared, ...entryFindings], imports: usage.imports };
}

export function readJvmReuse(
  projectRoot: string,
  options: ReuseOptions,
): { findings: JavaFinding[]; imports: unknown } {
  return withSharedUsage(readReusePart(projectRoot, options), options);
}
