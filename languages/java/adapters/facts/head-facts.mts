import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readInside as readInsideUntyped } from '../../../../shared/conventions/read-inside.mjs';
import { projectFilePaths as projectFilePathsUntyped } from '../../../../shared/project-files/project-files.mjs';
import { messageOf, optionalText } from '../../../../shared/values/readers.mts';
import { detectJavaBuild as detectJavaBuildUntyped } from '../../builds/java-build.mts';
import { readEffectivePom as readEffectivePomUntyped } from '../../maven/configuration/effective-pom.mts';
import {
  kotlinFormatterOf as kotlinFormatterOfUntyped,
  mavenKotlinFacts as mavenKotlinFactsUntyped,
} from '../kotlin/kotlin-tools.mts';
import { featureFaceMatcher as featureFaceMatcherUntyped } from '../spring-arch/contract-types.mts';
import { springRolesFact } from '../spring-arch/spring-roles.mts';
import type { JavaSpawn } from '../typed/java-values.mts';

type HeadConfig = {
  readonly preset?: unknown;
  readonly layout?: unknown;
  readonly kotlin?: { readonly formatter?: unknown; readonly [field: string]: unknown } | undefined;
  readonly java?: { readonly buildTool?: string | undefined } | undefined;
  readonly [field: string]: unknown;
};
type KotlinFacts = { readonly formatter?: unknown; readonly [field: string]: unknown };
type HeadFacts = {
  readonly spring?: true;
  readonly featureFolders?: true;
  readonly springRoles?: unknown;
  readonly kotlin?: KotlinFacts;
};
type HeadHost = { readonly maven?: string | undefined; readonly spawn?: JavaSpawn | undefined };

const projectFilePaths: (root: string) => string[] = projectFilePathsUntyped;
const detectJavaBuild: (projectRoot: string, configured: string | undefined) => string =
  detectJavaBuildUntyped;
const readEffectivePom: (options: {
  projectRoot: string;
  maven: string | undefined;
  work: string;
  spawn: JavaSpawn | undefined;
  timeoutMs: number | undefined;
}) => string = readEffectivePomUntyped;
const kotlinFormatterOf: (
  projectRoot: string,
  configured: string | undefined,
  effectivePom?: string,
) => string = kotlinFormatterOfUntyped;
const mavenKotlinFacts: (
  projectRoot: string,
  configured: string | undefined,
  effectivePom: string | undefined,
) => KotlinFacts = mavenKotlinFactsUntyped;
const featureFaceMatcher: (options: {
  layout: unknown;
  modulePath: string;
}) => (file: string) => boolean = featureFaceMatcherUntyped;

const BUILD_FILE = /(?:^|\/)(?:pom\.xml|[^/]+\.gradle(?:\.kts)?|[^/]+\.versions\.toml)$/u;
const SPRING = /org\.springframework\b/u;
const MAIN_SOURCE = /(?:^|\/)src\/main\/(?:java|kotlin)\/.+\.(?:java|kt)$/u;
const COMMENTS = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?:^|[ \t])(?:\/\/|#)[^\n]*/gmu;

export function declaresSpring(
  projectRoot: string,
  files: readonly string[] = projectFilePaths(projectRoot),
): boolean {
  return files
    .filter((file) => BUILD_FILE.test(file))
    .some((file) => SPRING.test(readInside(projectRoot, file)?.replaceAll(COMMENTS, ' ') ?? ''));
}

export function hasFeatureFolders(files: readonly string[], layout: unknown): boolean {
  const isFeatureFace = featureFaceMatcher({ layout, modulePath: '' });
  return files.some((file) => MAIN_SOURCE.test(file) && isFeatureFace(file));
}

function readInside(root: string, relative: string): string | undefined {
  const text: unknown = readInsideUntyped(root, relative, 'utf8');
  return typeof text === 'string' ? text : undefined;
}

function effectivePomOf(
  projectRoot: string,
  { maven, spawn }: HeadHost,
): { text?: string; failure?: string } {
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-head-pom-'));
  try {
    return { text: readEffectivePom({ projectRoot, maven, work, spawn, timeoutMs: undefined }) };
  } catch (error) {
    return { failure: messageOf(error) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function kotlinFacts(projectRoot: string, config: HeadConfig, host: HeadHost): KotlinFacts {
  const configured = optionalText(config.kotlin?.formatter);
  const { text: effectivePom } =
    detectJavaBuild(projectRoot, config.java?.buildTool) === 'maven'
      ? effectivePomOf(projectRoot, host)
      : {};
  return effectivePom === undefined
    ? { formatter: kotlinFormatterOf(projectRoot, configured) }
    : mavenKotlinFacts(projectRoot, configured, effectivePom);
}

export function javaHeadFacts(
  projectRoot: string,
  config: HeadConfig,
  host: HeadHost = {},
): HeadFacts {
  const files = projectFilePaths(projectRoot);
  return {
    ...(declaresSpring(projectRoot, files) ? { spring: true } : {}),
    ...(hasFeatureFolders(files, config.layout) ? { featureFolders: true } : {}),
    ...springRolesFact(config),
    ...(config.preset === 'kotlin' ? { kotlin: kotlinFacts(projectRoot, config, host) } : {}),
  };
}
