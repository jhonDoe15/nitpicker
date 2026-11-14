import { resolveModuleSpecifier } from '../../../modules/module-resolution.mjs';
import { DEFAULT_EXPORT } from '../../../syntax/exported-components.mjs';
import { MAX_REEXPORT_DEPTH, isProductionModule, parsedModule } from './exported-constants.mjs';

function localName(reexport, name) {
  if (reexport.names === undefined) {
    return name === DEFAULT_EXPORT ? undefined : name;
  }
  return reexport.names.find(({ exported }) => exported === name)?.local;
}

function reexportedFrom(module, { file, name }, { aliases }) {
  return module.reexports.flatMap((reexport) => {
    const target = resolveModuleSpecifier(reexport.specifier, file, { aliases });
    const local = localName(reexport, name);
    return target.kind === 'file' && local !== undefined
      ? [{ file: target.path, name: local }]
      : [];
  });
}

function definingFiles(start, options) {
  const found = [];
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

export function definingModules(file, names, { root, aliases = [] }) {
  const options = { root, aliases };
  return new Set([...names].flatMap((name) => definingFiles({ file, name }, options)));
}
