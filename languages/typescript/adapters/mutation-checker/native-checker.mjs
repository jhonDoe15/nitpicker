import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../core/tooling/temporary-files.mjs';
import { typecheckEngine } from '../../preset/head-policy.mjs';
import { ts } from '../../typescript-api/typescript-api.mjs';
import { spawnNodeTool } from '../quality-areas/runners/tooling.mjs';
import { apiEntry, nativeDiagnostics } from '../typecheck/native-diagnostics.mjs';
import { strykerPlugins } from './plugin.mjs';

const SYNC_API_ENTRY = 'typescript/unstable/sync';

const PROBE_CONFIG = '.nitpicker-diff-tsconfig.stryker-probe.json';

const PROBE_OPTIONS = { noEmit: true, incremental: false };

export function nativeCheckerRuntime(engine, versions = process.versions) {
  return engine === 'native' && apiEntry(versions) === SYNC_API_ENTRY;
}

export function mutationCheckerEngine(targets, engine = typecheckEngine()) {
  return targets === undefined ? 'project' : engine;
}

function hasProjectReferences(tsconfigPath) {
  const { config } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  return config !== undefined && Object.hasOwn(config, 'references');
}

async function probeDiagnostics(projectRoot, tsconfigPath) {
  const probePath = trackTemporaryPath(path.join(path.dirname(tsconfigPath), PROBE_CONFIG));
  const probe = { extends: `./${path.basename(tsconfigPath)}`, compilerOptions: PROBE_OPTIONS };
  try {
    writeFileSync(probePath, `${JSON.stringify(probe)}\n`);
    return await nativeDiagnostics({ ts, configPath: probePath, projectRoot });
  } finally {
    rmSync(probePath, { force: true });
    untrackTemporaryPath(probePath);
  }
}

async function nativeTypecheck(projectRoot, tsconfigPath) {
  if (hasProjectReferences(tsconfigPath)) {
    return undefined;
  }
  const result = await probeDiagnostics(projectRoot, tsconfigPath);
  if (result.unsupported === true) {
    return undefined;
  }
  return result.diagnostics.every(
    (diagnostic) => diagnostic.category !== ts.DiagnosticCategory.Error,
  );
}

export async function mutationTypecheck({ options, tsconfigPath, engine }) {
  const nativeClean = nativeCheckerRuntime(engine)
    ? await nativeTypecheck(options.projectRoot, tsconfigPath)
    : undefined;
  if (nativeClean !== undefined) {
    return { clean: nativeClean, native: true };
  }
  const { status } = spawnNodeTool({
    options,
    relativeToolPath: 'typescript/bin/tsc',
    arguments_: ['--project', tsconfigPath, '--noEmit', '--incremental', 'false'],
  });
  return { clean: status === 0, native: false };
}

export function mutationCheckerConfig(config, { baselineErrors, native }) {
  if (baselineErrors) {
    return {
      ...config,
      checkers: [strykerPlugins[0].name],
      plugins: [...config.plugins, fileURLToPath(new URL('plugin.mjs', import.meta.url))],
    };
  }
  return native
    ? {
        ...config,
        typescriptChecker: { ...config.typescriptChecker, experimentalNativePreview: true },
      }
    : config;
}
