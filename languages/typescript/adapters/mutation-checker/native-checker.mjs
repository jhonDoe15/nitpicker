import { typecheckEngine } from '../../preset/head-policy.mjs';
import { ts } from '../../typescript-api/typescript-api.mjs';
import { spawnNodeTool } from '../quality-areas/runners/tooling.mjs';
import { apiEntry, nativeDiagnostics } from '../typecheck/native-diagnostics.mjs';

const SYNC_API_ENTRY = 'typescript/unstable/sync';

export function nativeCheckerRuntime(engine, versions = process.versions) {
  return engine === 'native' && apiEntry(versions) === SYNC_API_ENTRY;
}

export function mutationCheckerEngine(targets, engine = typecheckEngine()) {
  return targets === undefined ? 'project' : engine;
}

async function nativeTypecheck(projectRoot, tsconfigPath) {
  const result = await nativeDiagnostics({ ts, configPath: tsconfigPath, projectRoot });
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

export function withNativeChecker(config) {
  return {
    ...config,
    typescriptChecker: { ...config.typescriptChecker, experimentalNativePreview: true },
  };
}
