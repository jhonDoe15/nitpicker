import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackTemporaryPath, untrackTemporaryPath } from '../typed/tooling.mts';
import { typecheckEngine } from '../typed/head-policy.mts';
import { typescriptApi } from '../typed/typescript-program.mts';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { fieldsOf, listOf, objectOf } from '../../../../shared/values/readers.mts';
import { spawnNodeTool } from '../quality-areas/typed/tooling.mts';
import type { QualityAreaOptions } from '../quality-areas/typed/area-types.mts';
import type { StrykerConfig } from '../quality-areas/typed/mutation.mts';
import { apiEntry, nativeDiagnostics } from '../typecheck/native-diagnostics.mts';
import type { NativeOutcome } from '../typecheck/native-api.mts';
import { strykerPlugins } from './plugin.mts';

type Typecheck = { readonly clean: boolean; readonly native: boolean };

const ts = typescriptApi();

const SYNC_API_ENTRY = 'typescript/unstable/sync';

const PROBE_CONFIG = '.nitpicker-diff-tsconfig.stryker-probe.json';

const PROBE_OPTIONS = { noEmit: true, incremental: false };

export function nativeCheckerRuntime(
  engine: string,
  versions: Readonly<Record<string, string | undefined>> = process.versions,
): boolean {
  return engine === 'native' && apiEntry(versions) === SYNC_API_ENTRY;
}

export function mutationCheckerEngine(
  targets: readonly string[] | undefined,
  engine: string = typecheckEngine(),
): string {
  return targets === undefined ? 'project' : engine;
}

function hasProjectReferences(tsconfigPath: string): boolean {
  const config = objectOf(ts.readConfigFile(tsconfigPath, (name) => ts.sys.readFile(name)).config);
  return config !== undefined && Object.hasOwn(config, 'references');
}

async function probeDiagnostics(projectRoot: string, tsconfigPath: string): Promise<NativeOutcome> {
  const probePath = trackTemporaryPath(path.join(path.dirname(tsconfigPath), PROBE_CONFIG));
  const probe = { extends: `./${path.basename(tsconfigPath)}`, compilerOptions: PROBE_OPTIONS };
  try {
    await writeFile(probePath, `${JSON.stringify(probe)}\n`);
    return await nativeDiagnostics({ ts, configPath: probePath, projectRoot, engineHint: true });
  } finally {
    await rm(probePath, { force: true });
    untrackTemporaryPath(probePath);
  }
}

async function nativeTypecheck(
  projectRoot: string,
  tsconfigPath: string,
): Promise<{ readonly clean: boolean } | undefined> {
  if (hasProjectReferences(tsconfigPath)) {
    return undefined;
  }
  const result = await probeDiagnostics(projectRoot, tsconfigPath);
  if (result.unsupported === true) {
    return undefined;
  }
  return {
    clean: result.diagnostics.every(
      (diagnostic) => diagnostic.category !== ts.DiagnosticCategory.Error,
    ),
  };
}

export async function mutationTypecheck({
  options,
  tsconfigPath,
  engine,
}: {
  readonly options: QualityAreaOptions;
  readonly tsconfigPath: string;
  readonly engine: string;
}): Promise<Typecheck> {
  const nativeResult = nativeCheckerRuntime(engine)
    ? await nativeTypecheck(options.projectRoot, tsconfigPath)
    : undefined;
  if (nativeResult !== undefined) {
    return { clean: nativeResult.clean, native: true };
  }
  const { status } = spawnNodeTool({
    options,
    relativeToolPath: 'typescript/bin/tsc',
    arguments_: ['--project', tsconfigPath, '--noEmit', '--incremental', 'false'],
  });
  return { clean: status === 0, native: false };
}

export function mutationCheckerConfig(
  config: StrykerConfig,
  { baselineErrors, native }: { readonly baselineErrors: boolean; readonly native: boolean },
): StrykerConfig {
  if (baselineErrors) {
    return {
      ...config,
      checkers: [strykerPlugins[0].name],
      plugins: [
        ...listOf(config['plugins']),
        fileURLToPath(checkoutModuleUrl(new URL('plugin.mjs', import.meta.url))),
      ],
    };
  }
  return native
    ? {
        ...config,
        typescriptChecker: {
          ...fieldsOf(config['typescriptChecker']),
          experimentalNativePreview: true,
        },
      }
    : config;
}
