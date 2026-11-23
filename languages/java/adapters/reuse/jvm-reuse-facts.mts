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
import { baselinePathsOf as untypedBaselinePathsOf } from '../../../../shared/rules/facts/baseline.mts';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mts';
import {
  pathInside as untypedPathInside,
  projectSourceFiles as untypedProjectSourceFiles,
} from '../review-rules/java-sources.mts';
import { readJvmUnits as untypedReadJvmUnits } from '../near-duplicates/jvm-trees.mts';
import { isGeneratedJvm } from '../generated/generated-sources.mts';
import { toolSlots } from '../../maven/parallel/slots/tool-slots.mts';
import { collectSourceFacts, parseJvmSource } from './source/jvm-source-facts.mts';
import {
  type BaselineEntry,
  type BaselinePolicy,
  type ReuseFacts,
  type ReuseFactsOptions,
  type ReuseOptions,
  type ReusePart,
  type ReuseProject,
} from './jvm-reuse-types.mts';
import { kotlinEntryPointFindings } from './kotlin-type-aliases.mts';

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

function projectOf(value: unknown): ReuseProject {
  return {
    qualifier: optionalText(fieldOf(value, 'qualifier')),
    reportRoot: optionalText(fieldOf(value, 'reportRoot')),
  };
}

function projectSourceFiles(
  projectRoot: string,
  { projects, kotlin = false, exclude, analyzeGeneratedSources }: ReuseFactsOptions,
): Map<string, ReuseProject> {
  const found: unknown = callUntyped(untypedProjectSourceFiles, projectRoot, {
    projects,
    kotlin,
    exclude,
  });
  const entries =
    found instanceof Map
      ? Array.from(found.entries(), (entry): [string, ReuseProject] => [
          textOf(entry[0]),
          projectOf(entry[1]),
        ])
      : [];
  return new Map(
    analyzeGeneratedSources
      ? entries
      : entries.filter(([file]) => !isGeneratedJvm(projectRoot, file)),
  );
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

function isPublished(project: ReuseProject): boolean {
  const published = fieldOf(project, 'published');
  return typeof published === 'boolean' ? published : publishedOf(project.reportRoot);
}

export function jvmReuseFacts(projectRoot: string, options: ReuseFactsOptions): ReuseFacts {
  const owners = projectSourceFiles(projectRoot, options);
  const sourceFacts = collectSourceFacts(projectRoot, owners);
  return {
    ...sourceFacts,
    packages: options.projects.map((project) => ({
      root: project.qualifier ?? '',
      published: isPublished(project),
    })),
    nearDuplicateUnits: unitFacts(projectRoot, [...owners.keys()]),
  };
}

function unitFacts(projectRoot: string, files: readonly string[]) {
  const sources = files.filter((file) => /\.(?:java|kt)$/u.test(file));
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
      definitions: parseJvmSource(before, file).definitions.map(
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
  const facts = jvmReuseFacts(projectRoot, {
    projects,
    kotlin,
    exclude: textsOf(policy.exclude),
    analyzeGeneratedSources: policy.analyzeGeneratedSources === true,
  });
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
