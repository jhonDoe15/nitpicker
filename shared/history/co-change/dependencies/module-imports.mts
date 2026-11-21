import path from 'node:path';
import { fieldOf, listOf } from '../../../values/readers.mts';

export const MODULE_IMPORTS = 'moduleImports';

export type ModuleImport = {
  readonly from: string;
  readonly to?: string | undefined;
  readonly package?: string | undefined;
};

type ImportsSection = { readonly moduleImports?: ModuleImport[] };

function isOptionalText(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isModuleImport(value: unknown): value is ModuleImport {
  return (
    typeof fieldOf(value, 'from') === 'string' &&
    isOptionalText(fieldOf(value, 'to')) &&
    isOptionalText(fieldOf(value, 'package'))
  );
}

export function moduleImportsOf(value: unknown): ModuleImport[] | undefined {
  const entries = listOf(value);
  return Array.isArray(value) && entries.every(isModuleImport) ? [...entries] : undefined;
}

function folderOf(file: string): string | undefined {
  const folder = path.posix.dirname(file);
  return folder === '.' ? undefined : folder;
}

function targetOf(entry: ModuleImport): string {
  return entry.to ?? `package:${String(entry.package)}`;
}

function compareImports(left: ModuleImport, right: ModuleImport): number {
  return left.from.localeCompare(right.from) || targetOf(left).localeCompare(targetOf(right));
}

function folderImport({ from, to, package: unresolved }: ModuleImport): ModuleImport | undefined {
  const source = folderOf(from);
  if (source === undefined) {
    return undefined;
  }
  if (unresolved !== undefined) {
    return { from, package: unresolved };
  }
  const target = to === undefined ? undefined : folderOf(to);
  return target === undefined || target === source ? undefined : { from, to: target };
}

export function folderImports(imports: readonly ModuleImport[]): ModuleImport[] {
  const pairs = new Map<string, ModuleImport>();
  for (const entry of imports) {
    const folded = folderImport(entry);
    if (folded !== undefined) {
      pairs.set(JSON.stringify([folded.from, targetOf(folded)]), folded);
    }
  }
  return [...pairs.values()].sort(compareImports);
}

export function wantsModuleImports(history: unknown): boolean {
  return fieldOf(history, 'coChange') === true;
}

export function moduleImportsSection(imports: unknown, history: unknown): ImportsSection {
  return imports !== undefined && wantsModuleImports(history)
    ? { [MODULE_IMPORTS]: folderImports(moduleImportsOf(imports) ?? []) }
    : {};
}
