import { pathToFileURL } from 'node:url';
import { resolveTool as untypedResolveTool } from '../../../../../core/tooling/tool-resolution.mjs';
import {
  encodedValue as untypedEncodedValue,
  withoutKnipCompilers as untypedWithoutKnipCompilers,
} from '../config-values.mjs';
import { fieldOf } from '../../../../../shared/values/readers.mts';

export type LoaderEntry = {
  module: string;
  load: (loader: unknown, file: string) => Promise<unknown>;
};

export const encodedValue: (value: unknown) => unknown = untypedEncodedValue;

export const withoutKnipCompilers: (config: unknown) => unknown = untypedWithoutKnipCompilers;

type ToolFunction = (...args: unknown[]) => unknown;

const resolveTool: (
  tool: string,
  options: { readonly bin: string; readonly packageRoot?: string },
) => { readonly binPath: string | undefined } = untypedResolveTool;

function isFunction(value: unknown): value is ToolFunction {
  return typeof value === 'function';
}

export async function importToolFile(tool: string, bin: string): Promise<unknown> {
  const { binPath } = resolveTool(tool, { bin });
  if (binPath === undefined) {
    throw new Error(`${bin} of ${tool} cannot be resolved`);
  }
  const loaded: unknown = await import(pathToFileURL(binPath).href);
  return loaded;
}

export function toolFunction(loaded: unknown, name: string): ToolFunction {
  const found = fieldOf(loaded, name);
  if (!isFunction(found)) {
    throw new TypeError(`The tool module does not export ${name}`);
  }
  return found;
}

export function loadResolvedConfigFile(loader: unknown, file: string): unknown {
  return toolFunction(loader, 'loadResolvedConfigFile')(file, {});
}
