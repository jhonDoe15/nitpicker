import { readReactor } from '../maven-project.mjs';
import type { KotlinRoots } from './kotlin-types.mts';

type ModuleBase = {
  readonly basedir: string;
  readonly pomFile: string;
  readonly coordinates: string;
  readonly packaging: string;
  readonly buildDirectory: string;
  readonly outputDirectory: string;
  readonly testOutputDirectory: string;
  readonly sourceRoots: string[];
  readonly testSourceRoots: string[];
  readonly resourceRoots: string[];
  readonly surefireReports: string;
  readonly failsafeReports: string;
  readonly runsFailsafe: boolean;
  readonly testJvmArgs: string[];
  readonly integrationTestJvmArgs: string[];
  readonly published: boolean;
  readonly jacocoDestFiles: string[];
  readonly jacocoAgentVersion: string | undefined;
  readonly archunitIncludes: string | undefined;
  readonly compiler: unknown;
};

export type ModuleDescription = ModuleBase & { readonly kotlin: KotlinRoots | undefined };

export const reactorModules: (projectRoot: string, effectivePom: string) => ModuleDescription[] =
  readReactor;
