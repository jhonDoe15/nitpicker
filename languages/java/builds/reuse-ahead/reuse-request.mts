import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  pathInside as untypedPathInside,
  projectSourceFiles as untypedProjectSourceFiles,
} from '../../adapters/review-rules/java-sources.mts';
import { publishedOf } from '../../adapters/reuse/jvm-reuse-facts.mts';
import {
  fieldOf,
  fieldsOf,
  listOf,
  optionalText,
  textOf,
  textsOf,
} from '../../../../shared/values/readers.mts';
import { callUntyped, type JavaPolicy } from '../../adapters/typed/java-values.mts';

type ReuseProject = {
  readonly qualifier: string;
  readonly sourceRoots: readonly string[];
  readonly kotlinSourceRoots: readonly string[];
  readonly kotlinExcludedFiles: readonly string[];
  readonly published: boolean;
};
type ReuseRun = {
  readonly projects: readonly ReuseProject[];
  readonly kotlin: boolean;
  readonly policy: JavaPolicy;
};
type ReuseRequest = ReuseRun & { readonly projectRoot: string };
type WideInputs = {
  readonly projects: readonly unknown[];
  readonly kotlin: boolean;
  readonly policy: JavaPolicy;
};

const pathInside: (root: string, file: string) => string = untypedPathInside;

function reuseProject(project: unknown, kotlin: boolean): ReuseProject {
  const published = fieldOf(project, 'published');
  return {
    qualifier: optionalText(fieldOf(project, 'qualifier')) ?? '',
    sourceRoots: textsOf(fieldOf(project, 'sourceRoots')),
    kotlinSourceRoots: kotlin ? textsOf(fieldOf(project, 'kotlinSourceRoots')) : [],
    kotlinExcludedFiles: textsOf(fieldOf(project, 'kotlinExcludedFiles')),
    published:
      typeof published === 'boolean'
        ? published
        : publishedOf(optionalText(fieldOf(project, 'reportRoot'))),
  };
}

function reusePolicy(policy: JavaPolicy): JavaPolicy {
  return {
    exclude: policy.exclude,
    exceptions: policy.exceptions,
    baseline: { snapshot: fieldOf(policy['baseline'], 'snapshot') },
    baselineRoot: policy.baselineRoot,
    baselineMovesFile: policy.baselineMovesFile,
  };
}

export function reuseRequest(
  projectRoot: string,
  { projects, kotlin, policy }: WideInputs,
): string {
  return JSON.stringify({
    projectRoot,
    kotlin,
    projects: projects.map((project) => reuseProject(project, kotlin)),
    policy: reusePolicy(policy),
  });
}

export function requestOf(request: string): ReuseRequest {
  const parsed: unknown = JSON.parse(request);
  const kotlin = fieldOf(parsed, 'kotlin') === true;
  return {
    projectRoot: textOf(fieldOf(parsed, 'projectRoot')),
    kotlin,
    projects: listOf(fieldOf(parsed, 'projects')).map((project) => reuseProject(project, kotlin)),
    policy: fieldsOf(fieldOf(parsed, 'policy')),
  };
}

export function sourceStamps(request: string): Record<string, string> {
  const { projectRoot, projects, kotlin, policy } = requestOf(request);
  const found: unknown = callUntyped(untypedProjectSourceFiles, projectRoot, {
    projects,
    kotlin,
    exclude: textsOf(policy.exclude),
  });
  const files = found instanceof Map ? [...found.keys()].map(textOf) : [];
  return Object.fromEntries(
    files.map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(pathInside(projectRoot, file)))
        .digest('base64'),
    ]),
  );
}
