import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import type { Inspection, MonorepoPlan, ProjectEntry } from '../project-types.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import { fieldOf } from '../../../shared/values/readers.mts';
import { SUPPORTED_PRESETS } from '../../configuration/validate.mts';
import { parseConfigFile, repositoryRootOf } from '../../configuration/layers/layers.mjs';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mts';
import { validateProjects as untypedValidateProjects } from '../../configuration/layers/settings.mjs';
import { resolveDeclaredProjects as untypedResolveDeclared } from '../discovery/declared-projects.mjs';
import {
  detectProjects as untypedDetectProjects,
  undeclaredProjects as untypedUndeclaredProjects,
} from '../discovery/detect.mjs';
import {
  listRepositoryFiles as untypedListFiles,
  listSubmodules as untypedListSubmodules,
} from '../discovery/repository-files.mjs';
import { describeProject, rejectReportFolderClash } from './project-entry.mts';

type Listed = {
  readonly source: 'declared' | 'detected';
  readonly entries: readonly ProjectEntry[];
};

type Found =
  | Listed
  | {
      readonly optedOut?: true;
      readonly source?: undefined;
      readonly entries?: undefined;
    };

type Scan = {
  readonly root: string;
  readonly files: readonly string[];
  readonly repositoryRoot: string;
  readonly submodules: readonly string[];
};

const validateProjects: (projects: unknown, presets: readonly string[]) => readonly ProjectEntry[] =
  untypedValidateProjects;
const resolveDeclaredProjects: (input: {
  readonly root: string;
  readonly entries: readonly ProjectEntry[];
  readonly files: readonly string[];
  readonly submodules: readonly string[];
}) => readonly ProjectEntry[] = untypedResolveDeclared;
type Discovery = {
  detectProjects(input: {
    readonly root: string;
    readonly rootConfig?: NitpickerConfig | undefined;
    readonly files?: readonly string[] | undefined;
    readonly submodules?: readonly string[] | undefined;
  }): { readonly multiple: boolean; readonly entries: readonly ProjectEntry[] };
  undeclaredProjects(input: {
    readonly root: string;
    readonly files: readonly string[];
    readonly projects: readonly { readonly path: string }[];
    readonly exclude?: unknown;
  }): readonly unknown[];
};

const discovery: Discovery = {
  detectProjects: untypedDetectProjects,
  undeclaredProjects: untypedUndeclaredProjects,
};
const listRepositoryFiles: (root: string) => readonly string[] = untypedListFiles;
const listSubmodules: (repositoryRoot: string) => readonly string[] = untypedListSubmodules;

function declaredEntries(root: string): readonly ProjectEntry[] | undefined {
  const file = path.join(root, CONFIG_FILE_NAME);
  const projects = existsSync(file)
    ? fieldOf(parseConfigFile(file, CONFIG_FILE_NAME), 'projects')
    : undefined;
  return projects === undefined ? undefined : validateProjects(projects, SUPPORTED_PRESETS);
}

function detectionConfig(
  root: string,
  repositoryRoot: string,
): { readonly config: NitpickerConfig; readonly error?: unknown } {
  try {
    return { config: readLayeredConfig(root, { repositoryRoot }) };
  } catch (error) {
    return { config: {}, error };
  }
}

function entriesOf({ root, files, repositoryRoot, submodules }: Scan): Found {
  const declared = declaredEntries(root);
  if (declared !== undefined) {
    return declared.length === 0
      ? { optedOut: true }
      : {
          source: 'declared',
          entries: resolveDeclaredProjects({ root, entries: declared, files, submodules }),
        };
  }
  const rootConfig = detectionConfig(root, repositoryRoot).config;
  const detected = discovery.detectProjects({ root, rootConfig, files, submodules });
  return detected.multiple ? { source: 'detected', entries: detected.entries } : {};
}

function monorepoPlan({
  root,
  files,
  found,
  repositoryRoot,
  submodules,
}: Scan & { readonly found: Listed }): MonorepoPlan {
  const rootConfig = readLayeredConfig(root, { repositoryRoot });
  const prefix = path.relative(repositoryRoot, root).split(path.sep).join('/') || '.';
  rejectReportFolderClash(found.entries);
  const allPaths = [...new Set(found.entries.map((entry) => entry.folder ?? entry.path))];
  const context = { root, repositoryRoot, prefix, rootConfig, allPaths };
  const projects = found.entries.map((entry) => describeProject(entry, context));
  return {
    root,
    repositoryRoot,
    prefix,
    rootConfig,
    source: found.source,
    projects,
    submodules,
    undeclared:
      found.source === 'detected'
        ? discovery.undeclaredProjects({ root, files, projects, exclude: rootConfig.exclude })
        : [],
  };
}

function submodulesUnder(root: string, repositoryRoot: string): readonly string[] {
  const prefix = path.relative(repositoryRoot, root).split(path.sep).join('/');
  return listSubmodules(repositoryRoot).flatMap((submodule) => {
    if (prefix === '') {
      return [submodule];
    }
    return submodule.startsWith(`${prefix}/`) ? [submodule.slice(prefix.length + 1)] : [];
  });
}

export function inspectRepository({
  root,
  files = listRepositoryFiles(root),
  repositoryRoot = repositoryRootOf(root),
}: {
  readonly root: string;
  readonly files?: readonly string[] | undefined;
  readonly repositoryRoot?: string | undefined;
}): Inspection {
  const submodules = submodulesUnder(root, repositoryRoot);
  const found = entriesOf({ root, files, repositoryRoot, submodules });
  if (found.entries === undefined) {
    if (found.optedOut === true) {
      return { files, undeclared: [] };
    }
    const { exclude } = detectionConfig(root, repositoryRoot).config;
    return {
      files,
      undeclared: discovery.undeclaredProjects({ root, files, projects: [], exclude }),
    };
  }
  return { files, plan: monorepoPlan({ root, files, found, repositoryRoot, submodules }) };
}

export function planMonorepo({ root }: { readonly root: string }): MonorepoPlan | undefined {
  return inspectRepository({ root }).plan;
}
