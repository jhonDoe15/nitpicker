import path from 'node:path';
import {
  checkedJavascriptFiles,
  checksJavascript,
  projectTsconfigs,
  resolveLayoutFor,
} from '../types/typed-views.mts';
import type { PolicyConfig, PolicyScope } from '../types/policy-types.mts';
import { usesLayout } from './scope-files.mts';

type ScopeSide = {
  readonly root: string;
  readonly files: readonly string[];
  readonly config: PolicyConfig;
};

function tsconfigsOf({ root, files, config }: ScopeSide): ReadonlyMap<string, boolean> {
  const hidden = resolveLayoutFor(config);
  return new Map(
    projectTsconfigs(root, files, hidden.isExcluded).map((file) => [
      file,
      checksJavascript(path.join(root, file)),
    ]),
  );
}

function checkedOf({ root, config }: ScopeSide): ReadonlySet<string> {
  return new Set(checkedJavascriptFiles(root, resolveLayoutFor(config)));
}

export function typescriptScope(
  base: ScopeSide,
  head: ScopeSide,
): Pick<PolicyScope, 'tsconfigs' | 'checkedJavascript'> {
  if (!usesLayout(head.config) || head.config.preset === 'javascript') {
    return { tsconfigs: undefined, checkedJavascript: undefined };
  }
  return {
    tsconfigs: { base: tsconfigsOf(base), head: tsconfigsOf(head) },
    checkedJavascript: { base: checkedOf(base), head: checkedOf(head) },
  };
}
