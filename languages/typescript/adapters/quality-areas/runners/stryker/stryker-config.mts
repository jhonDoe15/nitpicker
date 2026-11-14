import path from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fieldOf, fieldsOf, textsOf } from '../../../../../../shared/values/readers.mts';
import type { QualityAreaOptions } from '../../typed/area-types.mts';
import { readLayout } from '../../../typed/head-policy.mts';
import { trackTemporaryPath } from '../../../typed/tooling.mts';
import { policyFile } from '../../typed/tooling.mts';
import { type StrykerConfig, layoutTransformFor } from '../../typed/mutation.mts';
import { mutationTypecheck } from '../../../mutation-checker/native-checker.mts';
import { configuredTargets, MUTATION_REPORT_PATH } from '../mutation-scope.mts';

export type CompanionTarget = readonly [string | undefined, string];

const STRYKER_TSCONFIG_TARGET = '.nitpicker-diff-tsconfig.stryker.json';

export const STRYKER_CONFIG_PATH = 'languages/typescript/preset/defaults/stryker.config.mjs';

export function mutatePatterns(config: StrykerConfig): string[] | undefined {
  const mutate = fieldOf(config, 'mutate');
  return mutate === undefined ? undefined : textsOf(mutate);
}

export function strykerRunConfig(
  sourceConfig: StrykerConfig,
  {
    snapshot,
    targets,
    ...files
  }: {
    readonly snapshot: 'base' | 'head';
    readonly targets: readonly string[] | undefined;
    readonly tsconfigFile?: string;
    readonly vitestConfigFile?: string;
  },
): StrykerConfig {
  return {
    ...(Object.keys(files).length === 0
      ? sourceConfig
      : rebaseMutationConfig(sourceConfig, {
          tsconfigFile: files.tsconfigFile,
          vitestConfigFile: files.vitestConfigFile,
        })),
    ...(targets === undefined
      ? {}
      : { mutate: configuredTargets(targets, mutatePatterns(sourceConfig)) }),
    ...(snapshot === 'base' ? { checkers: [] } : {}),
    reporters: ['json'],
    jsonReporter: { fileName: MUTATION_REPORT_PATH },
  };
}

export function rebaseMutationConfig(
  sourceConfig: StrykerConfig,
  {
    tsconfigFile,
    vitestConfigFile,
  }: { readonly tsconfigFile: string | undefined; readonly vitestConfigFile: string | undefined },
): StrykerConfig {
  return {
    ...sourceConfig,
    tsconfigFile,
    vitest: {
      ...fieldsOf(fieldOf(sourceConfig, 'vitest')),
      configFile: vitestConfigFile,
    },
  };
}

export async function installStrykerTsconfig(
  options: QualityAreaOptions,
  {
    sourceRelativePath,
    createdFiles,
    engine,
  }: {
    readonly sourceRelativePath: string | undefined;
    readonly createdFiles: CreatedFiles;
    readonly engine: string;
  },
): Promise<{
  readonly tsconfigPath: string;
  readonly baselineErrors: boolean;
  readonly native: boolean;
}> {
  const target: CompanionTarget = [sourceRelativePath, STRYKER_TSCONFIG_TARGET];
  const tsconfigPath = installMutationCompanion(options, target, createdFiles);
  const strict = await mutationTypecheck({ options, tsconfigPath, engine });
  if (strict.clean) {
    return { tsconfigPath, baselineErrors: false, native: strict.native };
  }
  await writeFile(tsconfigPath, mutationCompanionText(options, target, { strictMutants: false }));
  const relaxed = await mutationTypecheck({ options, tsconfigPath, engine });
  return { tsconfigPath, baselineErrors: !relaxed.clean, native: relaxed.native };
}

export function installMutationCompanion(
  options: QualityAreaOptions,
  target: CompanionTarget,
  createdFiles: CreatedFiles,
): string {
  const targetPath = path.join(options.projectRoot, target[1]);
  writeTemporaryFile(targetPath, mutationCompanionText(options, target), createdFiles);
  return targetPath;
}

function mutationCompanionText(
  options: QualityAreaOptions,
  [sourceRelativePath, targetName]: CompanionTarget,
  transformOptions?: { readonly strictMutants: boolean },
): string {
  const sourcePath = policyFile(
    options.policyRoot,
    companionPath(path.posix.dirname(STRYKER_CONFIG_PATH), sourceRelativePath),
  );
  const targetPath = path.join(options.projectRoot, targetName);
  const transform = layoutTransformFor(sourceRelativePath ?? '', readLayout(), transformOptions);
  const text = readFileSync(sourcePath, 'utf8');
  return transform === undefined ? text : transform(text, targetPath);
}

function companionPath(
  configDirectory: string,
  relativePath: string | undefined,
): string | undefined {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    return relativePath;
  }
  return path.posix.join(configDirectory, relativePath.replaceAll('\\', '/'));
}

export function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export type CreatedFiles = {
  readonly track: (filePath: string) => void;
  readonly paths: () => readonly string[];
};

export function createdFilesTracker(): CreatedFiles {
  const paths: string[] = [];
  return {
    track: (filePath: string): void => {
      paths.push(filePath);
    },
    paths: () => [...paths],
  };
}

export function writeTemporaryFile(
  filePath: string,
  contents: string,
  createdFiles: CreatedFiles,
): void {
  if (existsSync(filePath)) {
    throw new Error(`Temporary mutation config already exists: ${filePath}`);
  }
  trackTemporaryPath(filePath);
  createdFiles.track(filePath);
  writeFileSync(filePath, contents);
}
