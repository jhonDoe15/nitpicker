import path from 'node:path';
import type { TSESTree } from '@typescript-eslint/utils';
import { nearestManifest } from '../../../rules/dependencies/package-manifest.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { importingDefault, type ImportEdit } from '../../edits/imports.mts';
import { allOf, type FixPlans } from '../../edits/plans.mts';
import type { FixPlan } from '../../support/ranges.mts';

type Requirement = { readonly name: string; readonly esmOnlyFrom: number };
type Dependency = {
  readonly module: string;
  readonly local: string;
  readonly esmOnlyFrom: number;
};
type Source = { readonly filename: string };

const MODULE_FILE = /\.m[jt]s$/u;
const COMMONJS_FILE = /\.c[jt]s$/u;
const BOUNDED_RANGE = /^[\^~]?(\d+)(?:\.(?:\d+|x)){0,2}$/u;

function majorOf(range: string | undefined): number | undefined {
  const found = range === undefined ? undefined : BOUNDED_RANGE.exec(range.trim())?.[1];
  return found === undefined ? undefined : Number(found);
}

function isModuleFile(filename: string, moduleType: string | undefined): boolean {
  if (COMMONJS_FILE.test(filename)) {
    return false;
  }
  return MODULE_FILE.test(filename) || moduleType === 'module';
}

function isUsableDependency(source: Source, { name, esmOnlyFrom }: Requirement): boolean {
  const manifest = nearestManifest(path.dirname(source.filename));
  if (manifest?.kind !== 'manifest' || !manifest.runtime.has(name)) {
    return false;
  }
  if (isModuleFile(source.filename, manifest.moduleType)) {
    return true;
  }
  const major = majorOf(manifest.runtimeVersions.get(name));
  return major !== undefined && major < esmOnlyFrom;
}

export function importingDependency(
  context: Context,
  call: TSESTree.Node,
  { module, local, esmOnlyFrom }: Dependency,
): (ImportEdit & { readonly local: string }) | undefined {
  if (!isUsableDependency(context, { name: module, esmOnlyFrom })) {
    return undefined;
  }
  const { sourceCode } = context;
  return importingDefault(sourceCode, sourceCode.ast, {
    sources: [module],
    name: local,
    sites: [call],
  });
}

export function planWithImport(
  edit: ImportEdit,
  plans: readonly (FixPlan | undefined)[],
): FixPlans | undefined {
  return allOf(edit.present ? plans : [edit.plan, ...plans]);
}
