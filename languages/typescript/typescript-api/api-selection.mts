import { createRequire, findPackageJSON } from 'node:module';
import path from 'node:path';
import {
  errorCode,
  hasJavaScriptApi,
  packageHasJavaScriptApi,
  redirectTypeScriptApi,
} from './api-redirect.mts';

function resolvedTypeScript(resolve: (id: string) => string): string | undefined {
  try {
    return resolve('typescript');
  } catch (error) {
    if (errorCode(error) === 'MODULE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
}

function installedTypeScriptRoot(): string | undefined {
  try {
    const packageFile = findPackageJSON('typescript', import.meta.url);
    return packageFile === undefined ? undefined : path.dirname(packageFile);
  } catch (error) {
    if (errorCode(error) === 'ERR_MODULE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
}

export type SelectedTypeScriptApi = { file: string; bundled: boolean };

export function selectTypeScriptApi(
  resolve: (id: string) => string = createRequire(import.meta.url).resolve,
  installedRoot: string | undefined = installedTypeScriptRoot(),
): SelectedTypeScriptApi {
  const resolved = resolvedTypeScript(resolve);
  return resolved !== undefined &&
    hasJavaScriptApi(resolved) &&
    installedRoot !== undefined &&
    packageHasJavaScriptApi(installedRoot)
    ? { file: resolved, bundled: false }
    : { file: resolve('typescript-js-api'), bundled: true };
}

export function redirectToBundledTypeScriptApi(
  environment: Readonly<NodeJS.ProcessEnv>,
  selected: SelectedTypeScriptApi = selectTypeScriptApi(),
): Readonly<NodeJS.ProcessEnv> {
  return selected.bundled
    ? {
        NODE_OPTIONS: redirectTypeScriptApi(
          path.dirname(path.dirname(selected.file)),
          environment['NODE_OPTIONS'],
        ),
      }
    : {};
}
