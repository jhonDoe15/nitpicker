import { mapFolder } from './module-folders.mjs';

const MODULE_SUFFIX = /^([\s\S]*)@(:[\w.-]+(?::[\w.-]+)*)$/u;

export function headPlacesOf(headFindings) {
  const places = new Set();
  for (const { path: findingPath, identity } of headFindings) {
    places.add(findingPath);
    const project = typeof identity === 'string' ? MODULE_SUFFIX.exec(identity)?.[2] : undefined;
    if (project !== undefined) {
      places.add(project);
    }
  }
  return places;
}

function unambiguous(original, mapped, places) {
  return mapped !== original && places.has(mapped) && !places.has(original) ? mapped : original;
}

export function movedFolder(findingPath, { declared, headPlaces }) {
  if (findingPath.includes('.') || declared.folders.size === 0) {
    return undefined;
  }
  const moved = unambiguous(findingPath, mapFolder(findingPath, declared.folders), headPlaces);
  return moved === findingPath ? undefined : moved;
}

export function remapModuleSuffix(identity, { declared, headPlaces }) {
  const parts = typeof identity === 'string' ? MODULE_SUFFIX.exec(identity)?.slice(1) : undefined;
  if (parts === undefined || declared.folders.size === 0) {
    return identity;
  }
  const [rest, project] = parts;
  const folder = project.slice(1).replaceAll(':', '/');
  const moved = mapFolder(folder, declared.folders);
  const mapped = `:${moved.replaceAll('/', ':')}`;
  return `${rest}@${unambiguous(project, mapped, headPlaces)}`;
}
