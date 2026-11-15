import { DEFAULT_EXPORT, resolvedFile, type ModuleAlias } from './copied-constants-views.mts';
import {
  MAX_REEXPORT_DEPTH,
  isProductionModule,
  parsedModule,
  type ParsedModule,
  type Reexport,
} from './exported-constants.mts';

type Start = { readonly file: string; readonly name: string };
type Options = { readonly root: string; readonly aliases: readonly ModuleAlias[] };

function localName(reexport: Reexport, name: string): string | undefined {
  if (reexport.names === undefined) {
    return name === DEFAULT_EXPORT ? undefined : name;
  }
  return reexport.names.find(({ exported }) => exported === name)?.local;
}

function reexportedFrom(
  module: ParsedModule,
  { file, name }: Start,
  { aliases }: Options,
): Start[] {
  return module.reexports.flatMap((reexport) => {
    const target = resolvedFile(reexport.specifier, file, { aliases });
    const local = localName(reexport, name);
    return target !== undefined && local !== undefined ? [{ file: target, name: local }] : [];
  });
}

function definingFiles(start: Start, options: Options): string[] {
  const found: string[] = [];
  const pending = [{ ...start, depth: 0 }];
  for (const { file, name, depth } of pending) {
    if (depth > MAX_REEXPORT_DEPTH || !isProductionModule(file, options.root)) {
      continue;
    }
    const module = parsedModule(file);
    if (module.defined.has(name)) {
      found.push(file);
      continue;
    }
    pending.push(
      ...reexportedFrom(module, { file, name }, options).map((next) => ({
        ...next,
        depth: depth + 1,
      })),
    );
  }
  return found;
}

export function definingModules(
  file: string,
  names: Iterable<string>,
  { root, aliases = [] }: { readonly root: string; readonly aliases?: readonly ModuleAlias[] },
): Set<string> {
  const options = { root, aliases };
  return new Set([...names].flatMap((name) => definingFiles({ file, name }, options)));
}
